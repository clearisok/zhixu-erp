import type { Pool } from "pg";
import type { MaterialConfirmation } from '../../features/ainuoke-material-progress/confirmed-facts.js';
import type { MaterialReadPorts } from "../../features/ainuoke-material-progress/read-service.js";
import { createMaterialSourceLoader } from "../../features/ainuoke-material-progress/source-adapter.js";
import type { AinuokeOrderDiscoveryQuery, AinuokeReportSnapshot } from "../../features/ainuoke-api/model/ainuoke-api.js";
import { hash, SourceError, sourceKeyValid } from "./contract.js";
import { sourceActor, boundOrders, supportsSourceAttribution, supportsMaterialCaptureContext, type BoundSourceOrder } from "./service.js";
export type SourceReadConfig = { sourceKey: string; maxAgeMs: number };
export function sourceReadConfig(values: Readonly<Record<string, string | undefined>>, identityMode: string): SourceReadConfig | null {
    if ((values.ZHIXU_AINUOKE_SOURCE_READ ?? "disabled") === "disabled") return null;
    const sourceKey = values.ZHIXU_AINUOKE_SOURCE_KEY ?? "";
    const maxAgeMs = Number(values.ZHIXU_AINUOKE_SOURCE_MAX_AGE_MS);
    if (values.ZHIXU_AINUOKE_SOURCE_READ !== "snapshot" || identityMode !== "session" || !sourceKeyValid(sourceKey)
        || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 86400000)
        throw new SourceError("invalid_source_read_configuration");
    return { sourceKey, maxAgeMs };
}
type Header = {
    run_id: string; account_fingerprint: string;
    discovery: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
    discovery_hash: string; last_error_code: string | null;
    order_scope: Array<Record<string, unknown>> | null; order_scope_hash: string | null;
};
type Stored = {
    sales_order_id: string; snapshots: AinuokeReportSnapshot[]; sales_contract_no: string;
    content_hash: string; attribution_change_id: string | null;
    source_link_id: string | null; captured_order_version: number | null;
};
type Identity = Parameters<MaterialReadPorts['resolveVisibleOrder']>[0];
/** No HTTP or secret access on GET. One request-local RR snapshot covers aliases, source run and private receipts. */
export function createPersistedMaterialPorts(pool: Pool, config: SourceReadConfig, now: () => number = Date.now,
    confirmations?: { sourceKey: string; accountFingerprint: string; byOrder: ReadonlyMap<string, readonly MaterialConfirmation[]> }): MaterialReadPorts {
    if (!sourceKeyValid(config.sourceKey) || !Number.isSafeInteger(config.maxAgeMs) || config.maxAgeMs < 1000 || config.maxAgeMs > 86400000)
        throw new SourceError("invalid_source_read_configuration");
    if (confirmations && (confirmations.sourceKey !== config.sourceKey || !/^[a-f0-9]{64}$/u.test(confirmations.accountFingerprint)))
        throw new SourceError('confirmation_source_mismatch');
    const privateFacts = new Map([...(confirmations?.byOrder ?? [])].map(([id, facts]) => [id, structuredClone(facts)]));
    const prepareBatch: NonNullable<MaterialReadPorts['prepareBatch']> = async (identity, ids) => {
        if (ids.length > 200) throw new SourceError('source_order_limit');
        const client = await pool.connect();
        let actor: Identity, orders: Map<string, BoundSourceOrder>, header: Header | undefined, indexed: Map<string, Stored>;
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            actor = await sourceActor(client, identity, false, false);
            const wanted = new Set(ids);
            orders = new Map((await boundOrders(client)).filter(order => wanted.has(order.id)).map(order => [order.id, order]));
            const attributed = await supportsSourceAttribution(client), context = await supportsMaterialCaptureContext(client);
            header = (await client.query<Header>(`SELECT r.id::text AS run_id,p.account_fingerprint,r.discovery,r.discovery_hash,p.last_error_code,
                ${context ? 'r.order_scope' : 'NULL::jsonb'} AS order_scope,${attributed ? 'r.order_scope_hash' : 'NULL::text'} AS order_scope_hash
                FROM ainuoke_source_profiles p JOIN ainuoke_source_runs r ON r.id=p.latest_run_id AND r.source_key=p.source_key
                WHERE p.source_key=$1 AND p.enabled=true`, [config.sourceKey])).rows[0];
            if (header && hash(header.discovery) !== header.discovery_hash) throw new SourceError('source_snapshot_changed');
            const records = header ? (await client.query<Stored>(`SELECT s.sales_order_id::text,s.snapshots,s.sales_contract_no,s.content_hash,
                ${attributed ? 's.attribution_change_id::text' : 'NULL::text'} AS attribution_change_id,
                ${context ? 's.source_link_id::text' : 'NULL::text'} AS source_link_id,
                ${context ? 's.captured_order_version' : 'NULL::integer'} AS captured_order_version
                FROM ainuoke_material_source_snapshots s WHERE s.run_id=$1::uuid AND s.sales_order_id=ANY($2::uuid[])`, [header.run_id, ids])).rows : [];
            indexed = new Map(records.map(record => [record.sales_order_id, record]));
            await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
        const verifyIdentity = (other: Identity) => {
            if (other.userId !== actor.userId || other.internalUserId !== actor.internalUserId) throw new SourceError('source_actor_unavailable');
        };
        const resolveVisibleOrder: MaterialReadPorts['resolveVisibleOrder'] = async (other, id) => {
            verifyIdentity(other); const order = orders.get(id), record = indexed.get(id);
            if (!order) return null;
            if (!record) return order.attributionChangeId ? order : null;
            return record.sales_contract_no === order.salesContractNo ? order : null;
        };
        return {
            resolveVisibleOrder,
            loadConfirmations: async (candidate, other) => {
                verifyIdentity(other);
                const order = orders.get(candidate.id);
                if (!order || order.version !== candidate.version || order.salesContractNo !== candidate.salesContractNo) throw new SourceError('confirmation_source_mismatch');
                if (confirmations && header?.account_fingerprint !== confirmations.accountFingerprint) throw new SourceError('confirmation_source_mismatch');
                // A receipt belongs to its reviewed SO; effective attribution never silently transfers it.
                return structuredClone(privateFacts.get(candidate.id) ?? []);
            },
            loadSource: async (candidate, other) => {
                verifyIdentity(other); const order = orders.get(candidate.id), record = indexed.get(candidate.id);
                if (!order || order.version !== candidate.version || order.salesContractNo !== candidate.salesContractNo) return null;
                if (!header || !record || record.sales_contract_no !== order.salesContractNo) return null;
                const invalidIdentity = () => ({salesOrderId: order.id, salesContractNo: record.sales_contract_no, provenance: 'server_snapshot' as const, snapshots: [], issue: 'identity_mismatch' as const});
                if (record.attribution_change_id !== order.attributionChangeId) return invalidIdentity();
                if (record.source_link_id !== null) {
                    if (!header.order_scope || hash(header.order_scope) !== header.order_scope_hash) throw new SourceError('source_snapshot_changed');
                    const scope = header.order_scope.find(row => row.id === order.id);
                    if (!scope || scope.sourceLinkId !== record.source_link_id || scope.version !== record.captured_order_version) throw new SourceError('source_snapshot_changed');
                    if (record.source_link_id !== order.sourceLinkId || scope.sourceOwnerOrderId !== order.sourceOwnerOrderId || scope.attributionChangeId !== order.attributionChangeId)
                        return invalidIdentity();
                } else if (header.order_scope !== null || record.captured_order_version !== null) throw new SourceError('source_snapshot_changed');
                if (header.last_error_code) return {salesOrderId: order.id, salesContractNo: record.sales_contract_no, provenance: 'server_snapshot', snapshots: [], issue: 'source_failed'};
                if (hash(record.snapshots) !== record.content_hash) throw new SourceError('source_snapshot_changed');
                return createMaterialSourceLoader({resolveVisibleOrder, provenance: 'server_snapshot', maxAgeMs: config.maxAgeMs, now,
                    readDiscovery: async () => structuredClone(header.discovery), readMaterial: async () => structuredClone(record.snapshots)})(candidate, actor);
            },
        };
    };
    return {
        prepareBatch,
        resolveVisibleOrder: async (identity, id) => (await prepareBatch(identity, [id])).resolveVisibleOrder(identity, id),
        loadSource: async (order, identity) => (await prepareBatch(identity, [order.id])).loadSource!(order, identity),
        loadConfirmations: async (order, identity) => (await prepareBatch(identity, [order.id])).loadConfirmations!(order, identity),
    };
}
