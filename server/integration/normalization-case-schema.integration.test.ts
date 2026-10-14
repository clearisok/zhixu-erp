import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { createSalesOrder } from '../sales-orders/repository.js';
test('normalization case schema preserves identity and append-only review history',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('normalization_cases')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));
 const actor=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('case-synthetic','unused','Synthetic','viewer') RETURNING id")).rows[0].id;
 const orders=await Promise.all([createSalesOrder(pool,{creationSource:'manual'}),createSalesOrder(pool,{creationSource:'manual'})]);const ids=orders.map(o=>o.id).sort();
 const create=()=>pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...ids,actor,randomUUID(),'a'.repeat(64)]);
 const id=(await create()).rows[0].id;
 const event=(version:number,type:string,reason='Synthetic review')=>pool.query('INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,version,actor,randomUUID(),'b'.repeat(64),type,reason,JSON.stringify({executionAuthorized:false})]);
 await t.test('one canonical case per pair and immutable order identity',async()=>{
  await assert.rejects(create);await assert.rejects(()=>pool.query('UPDATE sales_order_normalization_cases SET first_order_id=second_order_id WHERE id=$1',[id]));await assert.rejects(()=>pool.query('DELETE FROM sales_order_normalization_cases WHERE id=$1',[id]));
 });
 await t.test('opening is version one and cannot execute or omit reason',async()=>{
  await assert.rejects(()=>event(1,'executed'));await assert.rejects(()=>event(2,'opened'));await assert.rejects(()=>event(1,'review_note'));await assert.rejects(()=>event(1,'opened','  '));await event(1,'opened');
 });
 await t.test('concurrent updates with the same version have exactly one winner',async()=>{
  const results=await Promise.allSettled([event(2,'review_note'),event(2,'review_note')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_normalization_case_events WHERE case_id=$1',[id])).rows[0].n,2);
 });
 await t.test('withdrawal is retained and reopening needs a new event',async()=>{
  await event(3,'withdrawn');await assert.rejects(()=>event(4,'review_note'));await event(4,'reopened');await assert.rejects(()=>event(5,'reopened'));await event(5,'review_note');
 });
 await t.test('old evidence cannot be edited or deleted; source SOs remain unchanged',async()=>{
  await assert.rejects(()=>pool.query("UPDATE sales_order_normalization_case_events SET evidence='{}' WHERE case_id=$1",[id]));await assert.rejects(()=>pool.query('DELETE FROM sales_order_normalization_case_events WHERE case_id=$1',[id]));
  const rows=(await pool.query('SELECT id::text,version,creation_source,lifecycle_state FROM sales_orders ORDER BY id')).rows;
  assert.deepEqual(rows,ids.map(id=>({id,version:1,creation_source:'manual',lifecycle_state:'draft'})));
 });
});
