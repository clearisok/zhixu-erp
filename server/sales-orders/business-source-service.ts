import {previewColorSource,adoptColorSource,readPricingColors} from './color-commercial.js';
import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {readOrderCommercialState} from './commercial-version-service.js';
import {projectOrderCommercialState} from './commercial-projection.js';
import type {ProductSnapshot} from './product-snapshot.js';

function productSummary(snapshot:ProductSnapshot){
 const base=snapshot.revision.baseInfo as Record<string,unknown>|undefined;
 const text=(value:unknown)=>typeof value==='string'?value:'';
 return {quoteCode:text(snapshot.quoteCode),revisionLabel:text(snapshot.revision.revisionLabel),priceVersionName:snapshot.priceVersion?text(snapshot.priceVersion.name):'多个颜色方案',styleNo:text(base?.quoteStyleNo),styleName:text(base?.styleName)};
}
/** Snapshot payloads may contain cost information; only identity and permitted prices leave this boundary. */
export async function readOrderBusinessSource(c:Pick<Pool|PoolClient,'query'>,actor:TrustedIdentity,id:string){
 const state=await readOrderCommercialState(c,id);
 const source=state.current?(await c.query(`SELECT s.kind,s.reference_order_id::text AS "referenceOrderId",s.reference_commercial_version_id::text AS "referenceCommercialVersionId",o.order_no AS "referenceOrderNo",s.product_hash AS "productHash",s.recorded_at AS "recordedAt" FROM sales_order_business_source_snapshots s LEFT JOIN sales_orders o ON o.id=s.reference_order_id WHERE s.commercial_version_id=$1`,[state.current.id])).rows[0]:null;
 const saved=state.current&&actor.permissions.includes('quote.view')?(await c.query('SELECT product_snapshot FROM sales_order_business_source_snapshots WHERE commercial_version_id=$1',[state.current.id])).rows[0]:null;
 return {commercial:projectOrderCommercialState(actor,state),source:source??null,product:saved?productSummary(saved.product_snapshot):null,colors:await readPricingColors(c,id)};
}
export const previewOrderBusinessSource=previewColorSource;
export const adoptOrderBusinessSource=adoptColorSource;
