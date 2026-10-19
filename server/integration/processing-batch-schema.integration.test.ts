import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { createSalesOrder } from '../sales-orders/repository.js';

test('processing batch schema on disposable synthetic PostgreSQL', {timeout:180000}, async t => {
 const db=await startDisposablePostgres();
 const pool=new pg.Pool({connectionString:await db.createDatabase('processing_batches')});
 t.after(async()=>{await pool.end();await db.stop();});
 await runMigrations(pool,resolve('database/migrations'));
 const actor=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('synthetic-batch',crypt('synthetic',gen_salt('bf',4)),'Synthetic','viewer') RETURNING id")).rows[0].id;
 const batch=async()=> (await pool.query("INSERT INTO processing_order_batches(created_by,quote_id,revision_id,price_version_id,customer_name,business_style_no,quantity,order_date,customer_reference) VALUES($1,'same-quote','same-revision','same-price','Synthetic','SYN',10,'2026-10-14','same-po') RETURNING id",[actor])).rows[0].id as string;
 const confirm=async(id:string)=>{
  const v=(await pool.query('SELECT version FROM processing_order_batches WHERE id=$1',[id])).rows[0].version+1;
  const c=(await pool.query("INSERT INTO processing_order_batch_confirmations(batch_id,batch_version,actor_id,source_fingerprint,draft_hash,source_snapshot) VALUES($1,$2,$3,$4,$4,'{}') RETURNING id",[id,v,actor,'a'.repeat(64)])).rows[0].id;
  await pool.query("UPDATE processing_order_batches SET state='confirmed',version=version+1,current_confirmation_id=$2 WHERE id=$1",[id,c]);return c as string;
 };
 const order=async()=>{
  const o=await createSalesOrder(pool,{creationSource:'quote',sourceQuoteId:'same-quote',sourceRevisionId:'same-revision',sourcePriceVersionId:'same-price'});
  await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'processing')",[o.id]);
  const c=(await pool.query("INSERT INTO sales_order_commercial_versions(sales_order_id,version,actor_id,request_id,payload_hash,quote_id,revision_id,price_version_id,source_quote_version,source_kind,source_confirmed_at,source_fingerprint,quote_type,confirmed_labor_price,labor_currency,reason) VALUES($1,1,$2,$3,$4,'same-quote','same-revision','same-price',1,'quote_confirmation',now(),$4,'processing',0,'CNY','synthetic') RETURNING id",[o.id,actor,randomUUID(),'a'.repeat(64)])).rows[0].id;
  return {orderId:o.id,commercialId:c};
 };
 const consume=async(b:string,c:string,o:{orderId:string;commercialId:string})=>pool.query('INSERT INTO processing_order_batch_consumptions(batch_id,sales_order_id,confirmation_id,commercial_version_id,actor_id) VALUES($1,$2,$3,$4,$5)',[b,o.orderId,c,o.commercialId,actor]);
 await t.test('same quote and PO allow distinct real batches, with no SO allocated by draft',async()=>{
  assert.notEqual(await batch(),await batch());
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,0);
 });
 await t.test('cannot insert already confirmed or inject a consumed state without evidence',async()=>{
  const b=await batch();
  await assert.rejects(()=>pool.query("UPDATE processing_order_batches SET state='consumed',version=version+1 WHERE id=$1",[b]));
  await assert.rejects(()=>pool.query("INSERT INTO processing_order_batches(created_by,quote_id,revision_id,price_version_id,customer_name,business_style_no,quantity,order_date,state) VALUES($1,'q','r','p','S','S',1,'2026-10-14','cancelled')",[actor]));
 });
 await t.test('confirmation belongs to exact batch; cancellation is terminal and history immutable',async()=>{
  const a=await batch(),b=await batch(),c=await confirm(a);
  await assert.rejects(()=>pool.query("UPDATE processing_order_batches SET state='confirmed',version=version+1,current_confirmation_id=$2 WHERE id=$1",[b,c]));
  await pool.query("UPDATE processing_order_batches SET state='cancelled',version=version+1 WHERE id=$1",[a]);
  await assert.rejects(()=>pool.query("UPDATE processing_order_batches SET state='confirmed',version=version+1 WHERE id=$1",[a]));
  await assert.rejects(()=>pool.query('DELETE FROM processing_order_batch_confirmations WHERE id=$1',[c]));
  await assert.rejects(()=>pool.query('DELETE FROM processing_order_batches WHERE id=$1',[a]));
 });
 await t.test('two simultaneous consumers cannot bind two SO identities to one batch',async()=>{
  const b=await batch(),c=await confirm(b),o1=await order(),o2=await order();
  const results=await Promise.allSettled([consume(b,c,o1),consume(b,c,o2)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM processing_order_batch_consumptions WHERE batch_id=$1',[b])).rows[0].n,1);
  assert.equal((await pool.query('SELECT state FROM processing_order_batches WHERE id=$1',[b])).rows[0].state,'consumed');
  await assert.rejects(()=>pool.query('DELETE FROM processing_order_batch_consumptions WHERE batch_id=$1',[b]));
 });
 await t.test('one SO cannot consume two batches; wrong commercial identity is rejected',async()=>{
  const b1=await batch(),b2=await batch(),c1=await confirm(b1),c2=await confirm(b2),o=await order();
  await consume(b1,c1,o);
  await assert.rejects(()=>consume(b2,c2,o));
  const other=await order();
  await assert.rejects(()=>consume(b2,c2,{orderId:other.orderId,commercialId:o.commercialId}));
  assert.equal((await pool.query('SELECT state FROM processing_order_batches WHERE id=$1',[b2])).rows[0].state,'confirmed');
 });
 await t.test('batch content cannot be changed after preview, nor confirmations rewritten',async()=>{
  const b=await batch(),c=await confirm(b);
  await assert.rejects(()=>pool.query('UPDATE processing_order_batches SET quantity=11,version=version+1 WHERE id=$1',[b]));
  await assert.rejects(()=>pool.query("UPDATE processing_order_batch_confirmations SET source_fingerprint=$2 WHERE id=$1",[c,'b'.repeat(64)]));
 });
});
