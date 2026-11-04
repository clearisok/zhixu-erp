import type { Pool } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { sourceActor } from './service.js';
import { addOrders, previewAdditions, readBoundIdentities } from './additions.js';
import { hash, SourceError, sourceKeyValid, sourceUuidValid } from './contract.js';
import { projectMaterialProgress } from '../../features/ainuoke-material-progress/projection.js';
import { adaptAinuokeGarmentColorSizeSnapshots } from '../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js';
import { adaptAinuokeOrderDiscoverySnapshots } from '../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js';
import { hydrateContractEvidence } from './catalog-evidence.js';
type Identity=Pick<TrustedIdentity,'internalUserId'|'userId'>;
type Scope={sourceKey:string;sourceId:string};
async function observation(pool:Pool,identity:Identity,scope:Scope){
 if(!sourceKeyValid(scope.sourceKey)||typeof scope.sourceId!=='string'||!scope.sourceId||scope.sourceId.length>200)throw new SourceError('catalog_query_invalid');
 const actor=await sourceActor(pool,identity,false,false);
 const row=(await pool.query(`SELECT e.source_key,e.sales_contract_no,e.style_no,e.inside_order_no,e.quantity::text,e.delivery_date,e.visible,
  o.id::text,o.evidence,o.content_hash,o.captured_at,o.capture_evidence_id::text,p.account_fingerprint,s.last_error_code
  FROM ainuoke_catalog_entries e JOIN ainuoke_source_profiles p ON p.source_key=e.source_key AND p.enabled=true
  LEFT JOIN ainuoke_contract_sync_state s ON s.source_key=e.source_key AND s.source_id=e.source_id
  LEFT JOIN ainuoke_contract_observations o ON o.id=s.observation_id WHERE e.source_key=$1 AND e.source_id=$2`,[scope.sourceKey,scope.sourceId])).rows[0];
 if(!row)throw new SourceError('catalog_contract_not_available');
 if(row.evidence&&hash(row.evidence)!==row.content_hash)throw new SourceError('source_snapshot_changed');
 if(row.evidence)row.evidence=await hydrateContractEvidence(pool,row);
 return {row,actor};
}
/** History remains a dated read-only view, not a claim that old facts are current. */
export async function readCatalogDetail(pool:Pool,identity:Identity,scope:Scope){
 const {row}=await observation(pool,identity,scope);
 if(!row.evidence)return {salesContractNo:row.sales_contract_no,status:'not_fetched',observedAt:null,colors:[],materials:[]};
 const frozen=(await adaptAinuokeOrderDiscoverySnapshots(row.evidence.addition.discoveryAfter)).rows.find(r=>r.sourceId===scope.sourceId&&r.salesContractNo===row.sales_contract_no);
 if(!frozen)throw new SourceError('source_snapshot_changed');
 // The directory may have refreshed before this contract's next detail slot.
 // Interpret historical facts with their own frozen identity, never today's name.
 const colors=await adaptAinuokeGarmentColorSizeSnapshots({snapshots:row.evidence.addition.colors[row.sales_contract_no],requestedSalesContractNo:row.sales_contract_no,discoveryInsideOrderNo:frozen.insideOrderNo,expectedStyleNo:frozen.styleNo});
 const view=projectMaterialProgress({salesContractNo:row.sales_contract_no,styleNo:frozen.styleNo,insideOrderNo:frozen.insideOrderNo},row.evidence.materials);
 // Catalogue browsing doesn't expose purchase prices, quote terms or raw evidence.
 return {salesContractNo:row.sales_contract_no,status:row.last_error_code?'last_attempt_failed':'observed',observedAt:row.captured_at,
  colors:colors.usableRows.map(c=>({id:c.sourceRowIdentity,colorName:c.colorName,sizes:c.sizeAllocations.map(s=>({name:s.sizeName,quantity:s.quantity})),quantity:c.quantity})),
  materials:view.rows.map(r=>({key:r.canonicalKey,name:r.demand.materialName,color:r.demand.materialColor,type:r.demand.materialType,
    unit:r.unit,required:r.demand.requiredQuantity,purchased:r.purchased,inbound:r.inbound,shipped:r.shipped,outbound:r.outbound}))};
}
export async function previewCatalogIntake(pool:Pool,identity:Identity,scope:Scope){
 const {row,actor}=await observation(pool,identity,scope);requirePermission(actor.permissions,'ainuoke.bind');
 if(!row.evidence||!row.visible||row.last_error_code)throw new SourceError('catalog_refresh_required');
 const reviewed=await previewAdditions(row.evidence.addition,[row.sales_contract_no],await readBoundIdentities(pool),Date.now(),600000);
 if(reviewed.alreadyBound)throw new SourceError('catalog_already_adopted');
 const c=reviewed.candidates[0];
 return {observationId:row.id,expectedPreview:reviewed.reviewHash,salesContractNo:c.source.salesContractNo,quantity:c.source.quantity,
  deliveryDate:c.source.contractDeliveryDate,colors:c.colors.map(r=>({colorName:r.colorName,quantity:r.quantity})),
  effects:['建立正式订单','保留报价来源待维护','按合同交期初始化默认交期与关账月份归属']};
}
export async function adoptCatalogContract(pool:Pool,identity:Identity,input:Scope&{observationId:string;expectedPreview:string;requestId:string}){
 if(!sourceUuidValid(input.requestId)||!sourceUuidValid(input.observationId)||typeof input.expectedPreview!=='string'||!/^[a-f0-9]{64}$/i.test(input.expectedPreview))throw new SourceError('catalog_intake_invalid');
 const {row}=await observation(pool,identity,input);
 // Existing immutable observation can service a receipt replay even if a later
 // capture moved the pointer; addOrders checks the saved request before TTL.
 const saved=(await pool.query('SELECT source_key,evidence,content_hash,capture_evidence_id::text FROM ainuoke_contract_observations WHERE id=$1 AND source_key=$2 AND source_id=$3',[input.observationId,input.sourceKey,input.sourceId])).rows[0];
 if(!saved||hash(saved.evidence)!==saved.content_hash)throw new SourceError('catalog_intake_invalid');
 const evidence=await hydrateContractEvidence(pool,{...saved,account_fingerprint:row.account_fingerprint});
 return addOrders(pool,identity,{sourceKey:input.sourceKey,accountFingerprint:row.account_fingerprint,selected:[row.sales_contract_no],expectedPreview:input.expectedPreview,
  receipt:{requestId:input.requestId,observationId:input.observationId},collect:async()=>{
   if(row.id!==input.observationId||!row.visible||row.last_error_code)throw new SourceError('catalog_intake_preview_changed');return evidence.addition;
  }});
}
