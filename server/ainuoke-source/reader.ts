import type { MaterialConfirmation } from '../../features/ainuoke-material-progress/confirmed-facts.js';
import type { Pool } from "pg";
import type { MaterialReadPorts } from "../../features/ainuoke-material-progress/read-service.js";
import { createMaterialSourceLoader } from "../../features/ainuoke-material-progress/source-adapter.js";
import type { AinuokeOrderDiscoveryQuery, AinuokeReportSnapshot } from "../../features/ainuoke-api/model/ainuoke-api.js";
import { hash, SourceError, sourceKeyValid } from "./contract.js";
import { sourceActor, boundOrders } from "./service.js";
export type SourceReadConfig = {
    sourceKey: string;
    maxAgeMs: number;
};
export function sourceReadConfig(values: Readonly<Record<string, string | undefined>>, identityMode: string): SourceReadConfig | null {
    if ((values.ZHIXU_AINUOKE_SOURCE_READ ?? "disabled") === "disabled")
        return null;
    const sourceKey = values.ZHIXU_AINUOKE_SOURCE_KEY ?? "";
    const maxAgeMs = Number(values.ZHIXU_AINUOKE_SOURCE_MAX_AGE_MS);
    if (values.ZHIXU_AINUOKE_SOURCE_READ !== "snapshot" || identityMode !== "session" || !sourceKeyValid(sourceKey)
        || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 86400000)
        throw new SourceError("invalid_source_read_configuration");
    return { sourceKey, maxAgeMs };
}
/** No network or secret access on GET. Same approved team, exact persisted order binding. */
export function createPersistedMaterialPorts(pool: Pool, config: SourceReadConfig, now: () => number = Date.now, confirmations?: { sourceKey: string; byOrder: ReadonlyMap<string, readonly MaterialConfirmation[]> }): MaterialReadPorts {
    if (!sourceKeyValid(config.sourceKey) || !Number.isSafeInteger(config.maxAgeMs) || config.maxAgeMs < 1000)
        throw new SourceError("invalid_source_read_configuration");
    if (confirmations && confirmations.sourceKey !== config.sourceKey) throw new SourceError('confirmation_source_mismatch');
    // Freeze operator input at construction; no browser payload, environment default or DB write.
    const privateFacts = new Map([...(confirmations?.byOrder ?? [])].map(([id, facts]) => [id, structuredClone(facts)]));
    const loadConfirmations: NonNullable<MaterialReadPorts['loadConfirmations']> = async (order, identity) => {
        await sourceActor(pool, identity, false); return privateFacts.get(order.id) ?? [];
    };
    type Stored = {
        discovery: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
        snapshots: AinuokeReportSnapshot[];
        sales_contract_no: string;
        content_hash: string;
        discovery_hash: string;
        last_error_code: string | null;
    };
    const stored = async (id: string): Promise<Stored | undefined> => (await pool.query<Stored>(`SELECT r.discovery,r.discovery_hash,s.snapshots,s.sales_contract_no,s.content_hash,p.last_error_code
     FROM ainuoke_source_profiles p JOIN ainuoke_source_runs r ON r.id=p.latest_run_id AND r.source_key=p.source_key
     JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id
     WHERE p.source_key=$1 AND p.enabled=true AND s.sales_order_id=$2::uuid`, [config.sourceKey, id])).rows[0];
    const resolveVisibleOrder: MaterialReadPorts["resolveVisibleOrder"] = async (identity, id) => {
        await sourceActor(pool, identity, false);
        const order = (await boundOrders(pool)).find(row => row.id === id);
        const snapshot = order && await stored(id);
        if (!order || !snapshot || snapshot.sales_contract_no !== order.salesContractNo)
            return null;
        return order;
    };
    const prepareBatch: NonNullable<MaterialReadPorts["prepareBatch"]> = async (identity, ids) => {
        if (ids.length > 200) throw new SourceError("source_order_limit");
        await sourceActor(pool, identity, false);
        const wanted = new Set(ids);
        const orders = new Map((await boundOrders(pool)).filter(order => wanted.has(order.id)).map(order => [order.id, order]));
        const header = (await pool.query<Pick<Stored, "discovery" | "discovery_hash" | "last_error_code"> & {run_id: string}>(`SELECT r.id::text AS run_id,r.discovery,r.discovery_hash,p.last_error_code
          FROM ainuoke_source_profiles p JOIN ainuoke_source_runs r ON r.id=p.latest_run_id AND r.source_key=p.source_key
          WHERE p.source_key=$1 AND p.enabled=true`, [config.sourceKey])).rows[0];
        if (header && hash(header.discovery) !== header.discovery_hash) throw new SourceError("source_snapshot_changed");
        const records = header ? (await pool.query<Pick<Stored,"snapshots"|"sales_contract_no"|"content_hash"> & {sales_order_id: string}>(`SELECT sales_order_id::text,sales_contract_no,snapshots,content_hash FROM ainuoke_material_source_snapshots WHERE run_id=$1::uuid AND sales_order_id=ANY($2::uuid[])`, [header.run_id, ids])).rows : [];
        const indexed = new Map(records.map(record => [record.sales_order_id, record]));
        const verifyIdentity = (other: Parameters<MaterialReadPorts["resolveVisibleOrder"]>[0]) => {
            if (other.userId !== identity.userId || other.internalUserId !== identity.internalUserId) throw new SourceError("source_actor_unavailable");
        };
        const resolveBatch: MaterialReadPorts["resolveVisibleOrder"] = async (other, id) => { verifyIdentity(other); return orders.get(id) ?? null; };
        return { resolveVisibleOrder: resolveBatch, loadConfirmations: async (order, other) => { verifyIdentity(other); return privateFacts.get(order.id) ?? []; }, loadSource: async (order, other) => {
            verifyIdentity(other); const record = indexed.get(order.id);
            if (!header || !record || record.sales_contract_no !== order.salesContractNo) return null;
            if (header.last_error_code) return {salesOrderId: order.id,salesContractNo:record.sales_contract_no,provenance:"server_snapshot",snapshots:[],issue:"source_failed"};
            if (hash(record.snapshots) !== record.content_hash) throw new SourceError("source_snapshot_changed");
            return createMaterialSourceLoader({resolveVisibleOrder:resolveBatch,provenance:"server_snapshot",maxAgeMs:config.maxAgeMs,now,
                readDiscovery:async()=>header.discovery,readMaterial:async()=>record.snapshots})(order, other);
        }};
    };
    return { prepareBatch, resolveVisibleOrder, loadConfirmations, loadSource: async (order, identity) => {
            await sourceActor(pool, identity, false);
            const record = await stored(order.id);
            if (!record || record.sales_contract_no !== order.salesContractNo)
                return null;
            if (record.last_error_code)
                return { salesOrderId: order.id, salesContractNo: record.sales_contract_no, provenance: "server_snapshot", snapshots: [], issue: "source_failed" };
            if (hash(record.snapshots) !== record.content_hash || hash(record.discovery) !== record.discovery_hash)
                throw new SourceError("source_snapshot_changed");
            // Capture one database generation for both provider calls; no cross-request mutable cache.
            return createMaterialSourceLoader({ resolveVisibleOrder, provenance: "server_snapshot", maxAgeMs: config.maxAgeMs, now,
                readDiscovery: async () => structuredClone(record.discovery),
                readMaterial: async () => structuredClone(record.snapshots) })(order, identity);
        } };
}
