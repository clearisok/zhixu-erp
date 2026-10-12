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
export function createPersistedMaterialPorts(pool: Pool, config: SourceReadConfig, now: () => number = Date.now): MaterialReadPorts {
    if (!sourceKeyValid(config.sourceKey) || !Number.isSafeInteger(config.maxAgeMs) || config.maxAgeMs < 1000)
        throw new SourceError("invalid_source_read_configuration");
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
    return { resolveVisibleOrder, loadSource: async (order, identity) => {
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
