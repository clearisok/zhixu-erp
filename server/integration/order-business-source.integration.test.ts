import {readBusinessSources} from '../quotes/business-source.js';
import {findSalesOrderIdsByQuoteProvenance} from '../confirmed-commercial-terms/repository.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {PERMISSION_KEYS} from '../../features/permissions/model/permissions.js';
import {permissionsForUser,synchronizePermissionCatalog} from '../auth/permissions.js';
import type {TrustedIdentity} from '../auth/session.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {createAinuokeSalesOrder} from '../sales-orders/service.js';
import {adoptOrderBusinessSource,previewOrderBusinessSource,readOrderBusinessSource} from '../sales-orders/business-source-service.js';
import {readOrderCommercialState} from '../sales-orders/commercial-version-service.js';
import {parseColorSelection,readPricingColors} from '../sales-orders/color-commercial.js';
import {listOrderSourceQuotes} from '../quotes/order-source-candidates.js';

const code=(value:string)=>(e:unknown)=>(e as {code:string}).code===value;
test('quote-only source, stable colors and immutable commercial lines',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('color_commercial')});t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));
 await synchronizePermissionCatalog(pool);await pool.query("INSERT INTO app_roles(id,name) VALUES('source-test','Synthetic')");for(const p of PERMISSION_KEYS)await pool.query('INSERT INTO app_role_permissions VALUES($1,$2)',['source-test',p]);
 const u=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('source-test','unused','Synthetic','viewer') RETURNING id::text,public_id::text")).rows[0];await pool.query("INSERT INTO app_user_roles VALUES($1,'source-test')",[u.id]);
 const actor:TrustedIdentity={internalUserId:u.id,userId:u.public_id,username:'source-test',userName:'Synthetic',permissions:await permissionsForUser(pool,u.id)};
 const q=createSyntheticQuoteFixture('business-source-synthetic-120','distribution');for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
 const r=q.revisions.find(r=>r.revisionId===q.defaultRevisionId)!;r.baseInfo.quoteStyleNo='SYN-SHIRT';r.baseInfo.brandName='Synthetic Brand';
 for(const [i,p] of r.priceVersions.entries()){p.quantity=100;p.trims.forEach(l=>l.usage=0);p.pricingParameters.laborCurrency='CNY';p.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:120+i*10,confirmedLaborPrice:10+i,note:'synthetic',confirmedAt:'2026-10-17T00:00:00Z'};}
 await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(q));let n=0;
 const order=async(colors:string[]=[])=>{const i=++n;return(await createAinuokeSalesOrder(pool,actor,{source:{sourceId:'BS-'+i,sourceRowIdentity:'ROW-'+i,salesContractNo:'SYN-'+i,insideOrderNo:'IN-'+i,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYN-SHIRT',companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic Brand',quantity:100,sourceHash:'HASH-'+i,fetchedAt:'2026-10-17T00:00:00Z'},colors:colors.map((colorName,j)=>({sourceLineIdentity:'row-'+j,colorName,quantity:50,deliveryDate:null,sourceHash:'color-'+j}))})).salesOrder.id;};
 const selection={kind:'quote',quoteId:q.id,revisionId:r.revisionId,priceVersionId:r.priceVersions[0].id};
 const command=async(id:string,s:Record<string,unknown>=selection)=>{const p=await previewOrderBusinessSource(pool,actor,id,s);return {selection:s,requestId:randomUUID(),expectedVersion:p.version,fingerprint:p.fingerprint,reason:'Synthetic source'};};
 const a=await order(['Black','White']),first=await command(a);
 await t.test('adoption needs no owner, preserves operational identities and replays the original request',async()=>{
  const before=(await pool.query('SELECT row_to_json(o) data FROM sales_orders o WHERE id=$1',[a])).rows;
  await adoptOrderBusinessSource(pool,actor,a,first);assert.deepEqual((await pool.query('SELECT row_to_json(o) data FROM sales_orders o WHERE id=$1',[a])).rows,before);
  assert.equal((await adoptOrderBusinessSource(pool,actor,a,first)).replayed,true);
  await assert.rejects(()=>adoptOrderBusinessSource(pool,actor,a,{...first,reason:'changed'}),code('business_source_retry_mismatch'));
  const state=await readOrderBusinessSource(pool,actor,a);assert.equal(state.source?.kind,'quote');assert.equal(state.commercial.current?.lines?.length,2);assert.equal(state.commercial.current?.pricingMode,'uniform');assert.equal(JSON.stringify(state).includes('fabrics'),false);
 });
 await t.test('source maintenance cannot overwrite an existing order price',async()=>{await assert.rejects(()=>command(a),code('source_change_requires_quote_center'));});
 await t.test('color quantity and source fingerprint changes keep identity; new/renamed colors remain unmatched',async()=>{
  const before=await readPricingColors(pool,a);await pool.query("UPDATE ainuoke_sales_order_color_mirrors SET quantity=55,source_line_identity='changed-'||source_line_identity WHERE sales_order_id=$1",[a]);
  assert.deepEqual((await readPricingColors(pool,a)).map(c=>c.id),before.map(c=>c.id));
  await pool.query("UPDATE ainuoke_sales_order_color_mirrors SET color_name='Navy' WHERE sales_order_id=$1 AND color_name='Black'",[a]);
  const current=await readOrderCommercialState(pool,a);assert.equal(current.current?.lines?.find(l=>l.colorName==='Black')?.salePrice,'120');assert.equal((await readPricingColors(pool,a)).some(c=>current.current?.lines?.some(l=>l.colorId===c.id)===false),true);
 });
 await t.test('multiple color schemes preserve different prices without a fake first/average scalar',async()=>{
  const id=await order(['Red','Blue']),colors=await readPricingColors(pool,id);const s={kind:'quote',quoteId:q.id,revisionId:r.revisionId,assignments:colors.map((c,i)=>({colorId:c.id,priceVersionId:r.priceVersions[i].id}))};
  await adoptOrderBusinessSource(pool,actor,id,await command(id,s));const state=await readOrderCommercialState(pool,id);assert.equal(state.current?.salePrice,null);assert.deepEqual(state.current?.lines?.map(l=>l.salePrice),['120','130']);assert.equal((await readOrderBusinessSource(pool,actor,id)).commercial.current?.pricingMode,'by_color');
  const c=await pool.connect();try{const loaded=await readBusinessSources(c,[{id:q.id,quoteCode:q.quoteCode,version:1,revisionId:r.revisionId,revisionLabel:r.revisionLabel,status:q.aggregateStatus,baseInfo:r.baseInfo}],['confirmedLabor','confirmedGarment']);assert.ok([...loaded.bindings.values()].every(b=>!b.partial));assert.ok(loaded.sources[0].versions.every(v=>v.confirmation?.linkage==='unlinked'));assert.ok((await findSalesOrderIdsByQuoteProvenance(c,{quoteId:q.id,revisionId:r.revisionId,priceVersionId:r.priceVersions[1].id})).includes(id));}finally{c.release();}
  await assert.rejects(()=>pool.query('UPDATE sales_order_commercial_lines SET actual_sale_price=1 WHERE commercial_version_id=$1',[state.current!.id]));
 });
 await t.test('source/version CAS, concurrent requests and audit rollback protect all lines',async()=>{
  const id=await order(),cmd=await command(id),results=await Promise.allSettled([adoptOrderBusinessSource(pool,actor,id,cmd),adoptOrderBusinessSource(pool,actor,id,{...cmd,requestId:randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await readOrderCommercialState(pool,id)).version,1);
  const other=await order(),stale=await command(other);await pool.query("UPDATE quote_center_quotes SET version=version+1 WHERE id=$1",[q.id]);await assert.rejects(()=>adoptOrderBusinessSource(pool,actor,other,stale),code('business_source_changed'));
  const fresh=await command(other);await pool.query("CREATE FUNCTION fail_color_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$; CREATE TRIGGER fail_color_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION fail_color_audit()");
  try{await assert.rejects(()=>adoptOrderBusinessSource(pool,actor,other,fresh));assert.equal((await readOrderCommercialState(pool,other)).version,0);}finally{await pool.query('DROP TRIGGER fail_color_audit ON operation_logs; DROP FUNCTION fail_color_audit()');}
 });
 await t.test('new reorder writes retired, zero retained, unknown/ambiguous colors rejected',async()=>{
  assert.throws(()=>parseColorSelection({kind:'reorder',referenceOrderId:a,unchanged:true}),code('reorder_source_retired'));
  const id=await order(['Same','Same']);await assert.rejects(()=>command(id),code('order_color_identity_ambiguous'));
  const missing=await order(['Green']);await assert.rejects(()=>command(missing,{kind:'quote',quoteId:q.id,revisionId:r.revisionId,assignments:[]}),code('order_colors_changed'));
 });
 await t.test('amount field projection and completed orders fail closed',async()=>{
  const restricted={...actor,permissions:actor.permissions.filter(p=>!p.startsWith('commercial.'))};
  const data=await readOrderBusinessSource(pool,restricted,a),current=data.commercial.current;
  assert.ok(current);assert.equal(current.quoteId,q.id);assert.ok(current.quoteId.includes('120'));
  assert.equal(current.lines?.length,2);
  assert.deepEqual(current.sale,{visibility:'restricted'});assert.deepEqual(current.labor,{visibility:'restricted'});
  for(const key of ['reason','salePrice','saleCurrency','laborPrice','laborCurrency','productSnapshot','sourceSnapshot'])
   assert.equal(Object.hasOwn(current,key),false,`Restricted version exposes ${key}`);
  for(const line of current.lines??[]){
   assert.deepEqual(line.sale,{visibility:'restricted'});assert.deepEqual(line.labor,{visibility:'restricted'});
   for(const key of ['salePrice','baseSalePrice','laborPrice','laborCurrency','source','product','productHash'])
    assert.equal(Object.hasOwn(line,key),false,`Restricted color exposes ${key}`);
  }
  assert.deepEqual(Object.keys(data.product??{}).sort(),['quoteCode','revisionLabel','priceVersionName','styleNo','styleName'].sort());
  const visible=await readOrderBusinessSource(pool,actor,a),visibleLine=visible.commercial.current?.lines?.[0];
  assert.ok(visibleLine?.sale.visibility==='allowed');assert.equal(visibleLine.sale.value.price,'120');
  const id=await order();await pool.query("UPDATE sales_orders SET lifecycle_state='completed',version=version+1 WHERE id=$1",[id]);await assert.rejects(()=>command(id),code('order_commercial_frozen'));
 });
 await t.test('source search splits whitespace into AND terms without granting costs',async()=>{
  const rows=await listOrderSourceQuotes(pool,actor,new URLSearchParams({search:'SYN-SHIRT   Brand'}));assert.equal(rows.items.length,1);assert.equal((await listOrderSourceQuotes(pool,actor,new URLSearchParams({search:'SYN-SHIRT Missing'}))).items.length,0);
  const safe=await listOrderSourceQuotes(pool,{...actor,permissions:actor.permissions.filter(p=>p!=='quote.cost.view')},new URLSearchParams());assert.equal(safe.items[0].business.garmentPrice,undefined);assert.ok(safe.items[0].business.confirmedGarment);
 });
});

