import type { Pool, PoolClient } from "pg";
import type { MaterialReadPorts } from "../../features/ainuoke-material-progress/read-service.js";
import { createMaterialSourceLoader } from "../../features/ainuoke-material-progress/source-adapter.js";
import type { AinuokeOrderDiscoveryQuery, AinuokeReportSnapshot } from "../../features/ainuoke-api/model/ainuoke-api.js";
import { hash, SourceError, sourceKeyValid } from "./contract.js";
import { sourceActor, boundOrders, supportsSourceAttribution, supportsMaterialCaptureContext } from "./service.js";
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
        order_scope: Array<Record<string,unknown>>|null;order_scope_hash:string|null;source_link_id:string|null;captured_order_version:number|null;
    };
    const generation=async(identity:Parameters<MaterialReadPorts['resolveVisibleOrder']>[0],id:string)=>{
        const client=await pool.connect();
        try{
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const actor=await sourceActor(client,identity,false,false);
            const order=(await boundOrders(client)).find(row=>row.id===id);
            const attributed=await supportsSourceAttribution(client);
            const context=await supportsMaterialCaptureContext(client);
            const record=order?(await stored(client,id,attributed,context)):undefined;
            await client.query('COMMIT');return {actor,order,record};
        }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    };
    const stored = async (client:PoolClient,id:string,attributed:boolean,context:boolean): Promise<(Stored & {attribution_change_id:string|null})|undefined> => (await client.query<Stored & {attribution_change_id:string|null}>(`SELECT r.discovery,r.discovery_hash,s.snapshots,s.sales_contract_no,s.content_hash,p.last_error_code,
      ${attributed?'s.attribution_change_id::text':'NULL::text'} AS attribution_change_id,
      ${context?'r.order_scope':'NULL::jsonb'} AS order_scope,${attributed?'r.order_scope_hash':'NULL::text'} AS order_scope_hash,
      ${context?'s.source_link_id::text':'NULL::text'} AS source_link_id,${context?'s.captured_order_version':'NULL::integer'} AS captured_order_version
      FROM ainuoke_source_profiles p JOIN ainuoke_source_runs r ON r.id=p.latest_run_id AND r.source_key=p.source_key
      JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id
      WHERE p.source_key=$1 AND p.enabled=true AND s.sales_order_id=$2::uuid`,[config.sourceKey,id])).rows[0];
    const resolveVisibleOrder: MaterialReadPorts['resolveVisibleOrder']=async(identity,id)=>{
        const {order,record}=await generation(identity,id);
        if(!order)return null;
        if(!record)return order.attributionChangeId?order:null;
        return record.sales_contract_no===order.salesContractNo?order:null;
    };
    return {resolveVisibleOrder,loadSource:async(candidate,identity)=>{
        const {actor,order,record}=await generation(identity,candidate.id);
        if(!order||order.version!==candidate.version||order.salesContractNo!==candidate.salesContractNo)return null;
        if(!record||record.sales_contract_no!==order.salesContractNo)return null;
        if(record.attribution_change_id!==order.attributionChangeId)
            return {salesOrderId:order.id,salesContractNo:record.sales_contract_no,provenance:'server_snapshot',snapshots:[],issue:'identity_mismatch'};
        if(record.source_link_id!==null){
            if(!record.order_scope||hash(record.order_scope)!==record.order_scope_hash)throw new SourceError('source_snapshot_changed');
            const scope=record.order_scope.find(row=>row.id===order.id);
            if(!scope||scope.sourceLinkId!==record.source_link_id||scope.version!==record.captured_order_version)throw new SourceError('source_snapshot_changed');
            if(record.source_link_id!==order.sourceLinkId||scope.sourceOwnerOrderId!==order.sourceOwnerOrderId||scope.attributionChangeId!==order.attributionChangeId)
                return {salesOrderId:order.id,salesContractNo:record.sales_contract_no,provenance:'server_snapshot',snapshots:[],issue:'identity_mismatch'};
        }else if(record.order_scope!==null||record.captured_order_version!==null)throw new SourceError('source_snapshot_changed');
        if(record.last_error_code)
            return {salesOrderId:order.id,salesContractNo:record.sales_contract_no,provenance:'server_snapshot',snapshots:[],issue:'source_failed'};
        if(hash(record.snapshots)!==record.content_hash||hash(record.discovery)!==record.discovery_hash)throw new SourceError('source_snapshot_changed');
        // Identity and snapshot generation were read together. No HTTP access or mutable cross-request cache.
        return createMaterialSourceLoader({resolveVisibleOrder:async(current,id)=>current.userId===actor.userId&&id===order.id?order:null,provenance:'server_snapshot',maxAgeMs:config.maxAgeMs,now,
            readDiscovery:async()=>structuredClone(record.discovery),readMaterial:async()=>structuredClone(record.snapshots)})(candidate,actor);
    }};
}
