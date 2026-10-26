import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.ts';
import {snapshotPersistentDomainDatabase,assertPersistentDomainRecovery} from './persistent-domain-recovery-fixture.mjs';

// Only the sequence branch is under test here. Unrelated domain table statistics
// are explicit placeholders, not nonempty-domain recovery evidence.
async function sequenceState(readSequence){
  const tables=new Set();
  for(const file of await readdir(resolve('database/migrations')))if(file.endsWith('.sql')){
    const body=await readFile(resolve('database/migrations',file),'utf8');
    for(const match of body.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? ([a-z_]+)/g))tables.add(match[1]);
  }
  return {prepared:true,project:'zhixu-quote-trial-it-0123456789',sql:async query=>{
    if(query.includes('FROM pg_tables'))return [...tables].sort().join('\n');
    if(query.includes('FROM pg_sequences'))return readSequence(query);
    assert.ok(query.includes('json_build_object'));
    return JSON.stringify({count:1,sha256:'a'.repeat(64)});
  }};
}

test('snapshot sequence branch keeps exact bigint text and rejects one-unit or property drift',async()=>{
  const original='[{"sequencename":"exact_precision","last_value":9007199254740992,"max_value":9223372036854775807,"increment_by":1,"cycle":false}]';
  const before=await snapshotPersistentDomainDatabase(await sequenceState(async()=>original),true);
  assert.equal(typeof before.sequences,'string');assert.equal(before.sequences,original);
  assertPersistentDomainRecovery(before,await snapshotPersistentDomainDatabase(await sequenceState(async()=>original),true));
  for(const altered of [original.replace('9007199254740992','9007199254740993'),original.replace('9223372036854775807','9223372036854775806'),original.replace('"increment_by":1','"increment_by":2'),original.replace('false','true')]){
    const after=await snapshotPersistentDomainDatabase(await sequenceState(async()=>altered),true);
    assert.throws(()=>assertPersistentDomainRecovery(before,after),{name:'AssertionError'});
  }
});

test('same sequence SQL preserves real PostgreSQL high bigint values across independent connections',{timeout:120000},async t=>{
  const postgres=await startDisposablePostgres();let pool,independent,complete=false;
  t.after(async()=>{await pool?.end();await independent?.end();if(complete)await postgres.stop();else t.diagnostic('Precision failure retains this newly owned synthetic container: '+postgres.containerName);});
  const connectionString=await postgres.createDatabase('sequence_exactness');
  pool=new pg.Pool({connectionString,max:1});independent=new pg.Pool({connectionString,max:1});
  await pool.query('CREATE SEQUENCE exact_precision AS bigint START WITH 9007199254740992');
  await pool.query("SELECT setval('exact_precision','9007199254740992'::bigint,true)");
  const state=await sequenceState(async query=>(await pool.query(query)).rows[0].coalesce);
  const before=await snapshotPersistentDomainDatabase(state,true);
  assert.equal(typeof before.sequences,'string');assert.ok(before.sequences.includes('9223372036854775807'));assert.ok(before.sequences.includes('9007199254740992'));
  assertPersistentDomainRecovery(before,await snapshotPersistentDomainDatabase(state,true));
  await pool.query("SELECT setval('exact_precision','9007199254740993'::bigint,true)");
  assert.equal((await independent.query('SELECT last_value::text FROM exact_precision')).rows[0].last_value,'9007199254740993');
  const after=await snapshotPersistentDomainDatabase(state,true);assert.ok(after.sequences.includes('9007199254740993'));
  assert.throws(()=>assertPersistentDomainRecovery(before,after),{name:'AssertionError'});
  complete=true;
});
