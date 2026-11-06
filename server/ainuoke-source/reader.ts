import { supportsOrderHeads } from './followup.js';
import type { Pool, PoolClient } from "pg";
import type { MaterialConfirmation } from '../../features/ainuoke-material-progress/confirmed-facts.js';
import type { MaterialReadPorts } from "../../features/ainuoke-material-progress/read-service.js";
import { createMaterialSourceLoader } from "../../features/ainuoke-material-progress/source-adapter.js";
import { adaptAinuokeOrderDiscoverySnapshots } from "../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js";
import { normalizeAinuokeSalesContractNo } from "../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js";
import type { AinuokeOrderDiscoveryQuery, AinuokeReportSnapshot } from "../../features/ainuoke-api/model/ainuoke-api.js";
import { hash, SourceError, sourceKeyValid } from "./contract.js";
import { sourceActor, boundOrders, supportsSourceAttribution, supportsMaterialCaptureContext } from "./service.js";
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
type PrivateConfirmations = { sourceKey: string; accountFingerprint: string; byOrder: ReadonlyMap<string, readonly MaterialConfirmation[]> };
function validateReadConfiguration(config: SourceReadConfig, confirmations?: PrivateConfirmations) {
    if (!sourceKeyValid(config.sourceKey) || !Number.isSafeInteger(config.maxAgeMs) || config.maxAgeMs < 1000 || config.maxAgeMs > 86400000)
        throw new SourceError("invalid_source_read_configuration");
    if (confirmations && (confirmations.sourceKey !== config.sourceKey || !/^[a-f0-9]{64}$/u.test(confirmations.accountFingerprint)))
        throw new SourceError('confirmation_source_mismatch');
}
/** Source publishers lock the profile before physical orders. Domain writers use
 * the same order and retain this lock until their own transaction commits. */
export async function freezePersistedMaterialProfile(client: PoolClient, config: SourceReadConfig) {
    validateReadConfiguration(config);
    await client.query('SELECT source_key FROM ainuoke_source_profiles WHERE source_key=$1 FOR SHARE', [config.sourceKey]);
}
/** Caller owns BEGIN/COMMIT. This is the same validated, request-local source
 * reader used by GET; it never performs HTTP or writes material/source facts. */
export async function prepareMaterialPortsInTransaction(client: PoolClient, config: SourceReadConfig, identity: Identity, ids: string[],
    now: () => number = Date.now, confirmations?: PrivateConfirmations) {
    validateReadConfiguration(config, confirmations);
    const localConfig = { sourceKey: config.sourceKey, maxAgeMs: config.maxAgeMs }, confirmationFingerprint = confirmations?.accountFingerprint;
    if (ids.length > 200) throw new SourceError('source_order_limit');
    const privateFacts = new Map([...(confirmations?.byOrder ?? [])].map(([id, facts]) => [id, structuredClone(facts)]));
    const actor = await sourceActor(client, identity, false, false);
    const wanted = new Set(ids);
    const orders = new Map((await boundOrders(client,false,ids)).filter(order => wanted.has(order.id)).map(order => [order.id, order]));
    const attributed = await supportsSourceAttribution(client), context = await supportsMaterialCaptureContext(client);
    const profile = (await client.query<{enabled:boolean;latest_run_id:string|null}>(
        'SELECT enabled,latest_run_id::text FROM ainuoke_source_profiles WHERE source_key=$1', [localConfig.sourceKey])).rows[0];
    const perOrder=await supportsOrderHeads(client);
    const legacyHeader = (await client.query<Header>(`SELECT r.id::text AS run_id,p.account_fingerprint,r.discovery,r.discovery_hash,p.last_error_code,
        ${context ? 'r.order_scope' : 'NULL::jsonb'} AS order_scope,${attributed ? 'r.order_scope_hash' : 'NULL::text'} AS order_scope_hash
        FROM ainuoke_source_profiles p JOIN ainuoke_source_runs r ON r.id=p.latest_run_id AND r.source_key=p.source_key
        WHERE p.source_key=$1 AND p.enabled=true`, [localConfig.sourceKey])).rows[0];
    if (!perOrder && profile?.enabled && profile.latest_run_id !== null && !legacyHeader) throw new SourceError('source_snapshot_changed');
    const heads=perOrder?(await client.query<Header & {sales_order_id:string}>(`SELECT h.sales_order_id::text,h.run_id::text,p.account_fingerprint,r.discovery,r.discovery_hash,h.last_error_code,r.order_scope,r.order_scope_hash
      FROM ainuoke_material_order_heads h JOIN ainuoke_source_profiles p ON p.source_key=h.source_key AND p.enabled=true
      LEFT JOIN ainuoke_source_runs r ON r.id=h.run_id AND r.source_key=h.source_key WHERE h.source_key=$1 AND h.sales_order_id=ANY($2::uuid[])`,[localConfig.sourceKey,ids])).rows:[];
    const headers=new Map(ids.map(id=>[id,perOrder?heads.find(h=>h.sales_order_id===id):legacyHeader]));
    for(const h of headers.values())if(h?.run_id && hash(h.discovery)!==h.discovery_hash)throw new SourceError('source_snapshot_changed');
    const runIds=[...new Set([...headers.values()].filter(h=>h?.run_id).map(h=>h!.run_id))];
    const records = runIds.length ? (await client.query<Stored>(`SELECT s.run_id::text,s.sales_order_id::text,s.snapshots,s.sales_contract_no,s.content_hash,
        ${attributed ? 's.attribution_change_id::text' : 'NULL::text'} AS attribution_change_id,
        ${context ? 's.source_link_id::text' : 'NULL::text'} AS source_link_id,
        ${context ? 's.captured_order_version' : 'NULL::integer'} AS captured_order_version
        FROM ainuoke_material_source_snapshots s WHERE s.run_id=ANY($1::uuid[]) AND s.sales_order_id=ANY($2::uuid[])`, [runIds, ids])).rows.filter(record=>(record as Stored & {run_id:string}).run_id===headers.get(record.sales_order_id)?.run_id) : [];
    const indexed = new Map(records.map(record => [record.sales_order_id, record]));
    const beforeFirstCapture = profile?.enabled === true && profile.latest_run_id === null;
    // A trusted intake can precede its first material capture. Reuse complete
    // Discovery identity validation; an absent material record is never a zero.
    const needsIntakeEvidence = legacyHeader && [...orders.values()].some(order => !order.attributionChangeId && !indexed.has(order.id) && (!perOrder || !headers.get(order.id)));
    if(needsIntakeEvidence&&hash(legacyHeader.discovery)!==legacyHeader.discovery_hash)throw new SourceError('source_snapshot_changed');
    const uncapturedContracts = needsIntakeEvidence
        ? new Set((await adaptAinuokeOrderDiscoverySnapshots(legacyHeader.discovery)).rows.map(row => row.salesContractNo)) : null;
    const verifyIdentity = (other: Identity) => {
        if (other.userId !== actor.userId || other.internalUserId !== actor.internalUserId) throw new SourceError('source_actor_unavailable');
    };
    const resolveVisibleOrder: MaterialReadPorts['resolveVisibleOrder'] = async (other, id) => {
        verifyIdentity(other); const order = orders.get(id), record = indexed.get(id);
        if (!order || profile?.enabled!==true || headers.get(id)?.last_error_code==='source_visibility_changed') return null;
        if (!record) return perOrder && (!legacyHeader || !!headers.get(id)) || order.attributionChangeId || beforeFirstCapture
            || uncapturedContracts?.has(normalizeAinuokeSalesContractNo(order.salesContractNo)) ? order : null;
        return record.sales_contract_no === order.salesContractNo ? order : null;
    };
    const ports: MaterialReadPorts = {
        resolveVisibleOrder,
        loadConfirmations: async (candidate, other) => {
            verifyIdentity(other);
            const order = orders.get(candidate.id);
            if (!order || order.version !== candidate.version || order.salesContractNo !== candidate.salesContractNo) throw new SourceError('confirmation_source_mismatch');
            if (confirmationFingerprint !== undefined && headers.get(candidate.id)?.account_fingerprint !== confirmationFingerprint) throw new SourceError('confirmation_source_mismatch');
            return structuredClone(privateFacts.get(candidate.id) ?? []);
        },
        loadSource: async (candidate, other) => {
            verifyIdentity(other); const order = orders.get(candidate.id), record = indexed.get(candidate.id), header=headers.get(candidate.id);
            if (!order || order.version !== candidate.version || order.salesContractNo !== candidate.salesContractNo) return null;
            // A failed new payload never invalidates a previously published
            // snapshot. Access/identity changes still fail closed below/above.
            const historicalFailure = header?.last_error_code && !/identity|account|visibility|permission|actor|scope|binding/.test(header.last_error_code);
            if (header?.last_error_code && (!historicalFailure || !record)) return {salesOrderId:order.id,salesContractNo:order.salesContractNo!,provenance:'server_snapshot',snapshots:[],issue:'source_failed'};
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
            if (hash(record.snapshots) !== record.content_hash) throw new SourceError('source_snapshot_changed');
            const result = await createMaterialSourceLoader({resolveVisibleOrder, provenance: 'server_snapshot', maxAgeMs: localConfig.maxAgeMs, now, retainPublishedHistory: true,
                readDiscovery: async () => structuredClone(header.discovery), readMaterial: async () => structuredClone(record.snapshots)})(candidate, actor);
            if (historicalFailure && result?.snapshots.length && (!result.issue || result.issue === 'stale')) result.issue = 'source_failed';
            return result;
        },
    };
    return { ports, generation: (orderId: string) => {
        const record = indexed.get(orderId), header=headers.get(orderId);
        return header && record ? { sourceKey: localConfig.sourceKey, runId: header.run_id, contentHash: record.content_hash,
            sourceLinkId: record.source_link_id, capturedOrderVersion: record.captured_order_version } : null;
    } };
}
/** No HTTP or secret access on GET. One request-local RR snapshot covers aliases, source run and private receipts. */
export function createPersistedMaterialPorts(pool: Pool, config: SourceReadConfig, now: () => number = Date.now,
    confirmations?: PrivateConfirmations): MaterialReadPorts {
    validateReadConfiguration(config, confirmations);
    const localConfig = { sourceKey: config.sourceKey, maxAgeMs: config.maxAgeMs };
    const privateConfirmations = confirmations ? { sourceKey: confirmations.sourceKey, accountFingerprint: confirmations.accountFingerprint,
        byOrder: new Map([...confirmations.byOrder].map(([id, facts]) => [id, structuredClone(facts)])) } : undefined;
    const prepareBatch: NonNullable<MaterialReadPorts['prepareBatch']> = async (identity, ids) => {
        if (ids.length > 200) throw new SourceError('source_order_limit');
        const client = await pool.connect();
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const prepared = await prepareMaterialPortsInTransaction(client, localConfig, identity, ids, now, privateConfirmations);
            await client.query('COMMIT');
            return prepared.ports;
        } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    };
    return {
        prepareBatch,
        resolveVisibleOrder: async (identity, id) => (await prepareBatch(identity, [id])).resolveVisibleOrder(identity, id),
        loadSource: async (order, identity) => (await prepareBatch(identity, [order.id])).loadSource!(order, identity),
        loadConfirmations: async (order, identity) => (await prepareBatch(identity, [order.id])).loadConfirmations!(order, identity),
    };
}
