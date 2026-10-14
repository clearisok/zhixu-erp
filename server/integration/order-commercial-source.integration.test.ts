import assert from 'node:assert/strict';
import test from 'node:test';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {createQuoteRepository} from '../quotes/repository.js';
import {quoteSnapshotFromBrowser} from '../quotes/model.js';
import {createSyntheticQuoteFixture} from './quote-fixture.js';
import {readCommercialCandidate} from '../sales-orders/commercial-source.js';
import {createSalesOrder} from '../sales-orders/repository.js';
import type {QuoteProvenance} from '../confirmed-commercial-terms/repository.js';

test('commercial candidate and immutable schema use only disposable synthetic data',{timeout:180000},async t=>{
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase('commercial_source')});t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));
 const repo=createQuoteRepository(pool);let index=0;
 const seed=async(type:'distribution'|'processing'='distribution')=>{
  const q=createSyntheticQuoteFixture('commercial-synthetic-'+(++index),type);
  for(const r of q.revisions){r.imageAttachmentIds=[];r.fileAttachmentIds=[];r.styleImageAttachmentId=null;}
  const r=q.revisions.find(r=>r.revisionId===q.defaultRevisionId)!;const pv=r.priceVersions[0];pv.pricingParameters.laborCurrency='CNY';pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:type==='processing'?null:0,confirmedLaborPrice:0,note:'synthetic',confirmedAt:'2026-10-14T00:00:00Z'};
  await repo.create(quoteSnapshotFromBrowser(q));return {quoteId:q.id,revisionId:r.revisionId,priceVersionId:pv.id};
 };
 const read=async(p:QuoteProvenance)=>{const c=await pool.connect();try{await c.query('BEGIN');const value=await readCommercialCandidate(c,p);await c.query('ROLLBACK');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const a=await seed();
 await t.test('unlinked confirmed quote needs no fabricated SO and zero remains valid',async()=>{
  const c=await read(a);assert.equal(c.salePrice,'0');assert.equal(c.laborPrice,'0');assert.equal(c.sourceKind,'quote_confirmation');assert.equal(c.sourceCctVersion,null);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,0);assert.equal(JSON.stringify(c).includes('999'),false);assert.equal(JSON.stringify(c).includes('fabrics'),false);
 });
 await t.test('processing sale is not applicable; unknown is not zero',async()=>{
  const p=await seed('processing');assert.equal((await read(p)).salePrice,null);
  await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,customer_confirmed_price,confirmed_labor_price,labor_currency) VALUES('quote',$1,$2,$3,NULL,NULL,'CNY')",[p.quoteId,p.revisionId,p.priceVersionId]);
  await assert.rejects(()=>read(p),(e:unknown)=>(e as {code:string}).code==='commercial_confirmation_required');
 });
 await t.test('CCT is an explicit different source and never falls back when incomplete',async()=>{
  await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,customer_confirmed_price,confirmed_labor_price,labor_currency) VALUES('quote',$1,$2,$3,120.125,10.5,'CNY')",[a.quoteId,a.revisionId,a.priceVersionId]);
  const c=await read(a);assert.equal(c.sourceKind,'cct');assert.equal(c.sourceCctVersion,1);assert.equal(c.salePrice,'120.125');assert.equal(c.laborPrice,'10.5');
  await pool.query('UPDATE confirmed_commercial_terms SET customer_confirmed_price=NULL,version=version+1 WHERE id=$1',[c.sourceCctId]);await assert.rejects(()=>read(a));
 });
 await t.test('wrong provenance and source currency mismatch fail closed',async()=>{
  await assert.rejects(()=>read({...a,priceVersionId:'not-owned'}));
  await pool.query("UPDATE confirmed_commercial_terms SET customer_confirmed_price=120,labor_currency='USD',version=version+1 WHERE quote_id=$1",[a.quoteId]);await assert.rejects(()=>read(a),(e:unknown)=>(e as {code:string}).code==='commercial_source_currency_conflict');
 });
 await t.test('adopted schema cannot overwrite, delete or point another order to its version',async()=>{
  const user=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('commercial-fixture','unused','Synthetic','viewer') RETURNING id")).rows[0];
  const order=await createSalesOrder(pool,{creationSource:'manual'}),other=await createSalesOrder(pool,{creationSource:'manual'});const id=randomUUID();
  const insert=`INSERT INTO sales_order_commercial_versions(id,sales_order_id,version,actor_id,request_id,payload_hash,quote_id,revision_id,price_version_id,source_quote_version,source_kind,source_confirmed_at,source_fingerprint,quote_type,confirmed_sale_price,confirmed_labor_price,labor_currency,reason) VALUES($1,$2,1,$3,$4,$5,'quote','revision','pv',1,'quote_confirmation','2026-10-14T00:00:00Z',$5,'distribution',120,10,'CNY','synthetic')`;
  await pool.query(insert,[id,order.id,user.id,randomUUID(),'a'.repeat(64)]);
  await pool.query('INSERT INTO sales_order_commercial_heads VALUES($1,$2,1)',[order.id,id]);
  await assert.rejects(()=>pool.query('UPDATE sales_order_commercial_versions SET confirmed_sale_price=999 WHERE id=$1',[id]));
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_commercial_versions WHERE id=$1',[id]));
  await assert.rejects(()=>pool.query('INSERT INTO sales_order_commercial_heads VALUES($1,$2,1)',[other.id,id]));
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_commercial_heads WHERE sales_order_id=$1',[order.id]));
 });
});
