import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { bootstrapAdmin } from '../auth/bootstrap.js';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.js';
import { bindOrders, previewBindings } from '../ainuoke-source/binding.js';
import { addOrders, discoverAdditions, previewAdditions, readBoundIdentities, requireAdditionProfile } from '../ainuoke-source/additions.js';
import { additionBundle, additionDiscoveryBundle, bindingBundle, freshMaterialBundle } from './ainuoke-binding-fixture.js';
import { syntheticOrder } from './ainuoke-source-fixture.js';
import { captureSource } from '../ainuoke-source/service.js';

test('controlled new-contract intake uses the existing order model and one atomic, audited confirmation', {timeout:120000}, async t => {
  const db=await startDisposablePostgres();
  const pool=new pg.Pool({connectionString:await db.createDatabase('source_additions')});
  try {
    await runMigrations(pool,resolve('database/migrations'));
    await synchronizePermissionCatalog(pool);
    await bootstrapAdmin(pool,{username:'synthetic.addition',displayName:'合成新增绑定员',password:'Synthetic-Addition-Only'});
    const actor=await loadExistingBootstrapActor(pool,'synthetic.addition');
    const options={sourceKey:'first-team',accountFingerprint:'a'.repeat(64)};
    const original=bindingBundle();
    const first=await previewBindings(original);
    await bindOrders(pool,actor,{...options,expectedPreview:first.reviewHash,collect:async()=>original});
    const count=async(table:string)=>(await pool.query('SELECT count(*)::int n FROM '+table)).rows[0].n as number;
    const selected=[syntheticOrder.salesContractNo+'-1'];

    await t.test('discovery and preview read only the bound ledger and source evidence',async()=>{
      const bound=await readBoundIdentities(pool);
      await requireAdditionProfile(pool,options.sourceKey,options.accountFingerprint);
      const found=await discoverAdditions(additionDiscoveryBundle(),bound);
      assert.deepEqual(found.additions.map(item=>item.salesContractNo),selected);
      const preview=await previewAdditions(additionBundle(),selected,bound);
      assert.equal(preview.alreadyBound,false);
      assert.equal(await count('sales_orders'),1);
      assert.equal(await count('ainuoke_source_profiles'),1);
      assert.equal(await count('ainuoke_sales_order_color_mirrors'),1);
    });

    await t.test('wrong review, account mismatch and changed source make no new order',async()=>{
      await assert.rejects(addOrders(pool,actor,{...options,selected,expectedPreview:'b'.repeat(64),collect:async()=>additionBundle()}),/addition_preview_changed/);
      const preview=await previewAdditions(additionBundle(),selected,await readBoundIdentities(pool));
      await assert.rejects(addOrders(pool,actor,{...options,accountFingerprint:'c'.repeat(64),selected,expectedPreview:preview.reviewHash,collect:async()=>additionBundle()}),/source_account_mismatch/);
      const changed=additionBundle();changed.discoveryBefore[0].rows[1].values.Num=200;changed.discoveryAfter=structuredClone(changed.discoveryBefore);
      await assert.rejects(addOrders(pool,actor,{...options,selected,expectedPreview:preview.reviewHash,collect:async()=>changed}),/addition_preview_changed/);
      assert.equal(await count('sales_orders'),1);
    });

    await t.test('late audit failure rolls back new order, mirror, link and log together',async()=>{
      await pool.query("CREATE FUNCTION reject_addition_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='AinuokeSourceAddition' THEN RAISE EXCEPTION 'synthetic late failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER addition_audit_guard BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_addition_audit()");
      const preview=await previewAdditions(additionBundle(),selected,await readBoundIdentities(pool));
      await assert.rejects(addOrders(pool,actor,{...options,selected,expectedPreview:preview.reviewHash,collect:async()=>additionBundle()}),/addition_failed/);
      assert.equal(await count('sales_orders'),1);
      assert.equal(await count('sales_order_source_links'),1);
      assert.equal(await count('ainuoke_sales_order_contract_mirrors'),1);
      assert.equal(await count('ainuoke_sales_order_color_mirrors'),1);
      await pool.query('DROP TRIGGER addition_audit_guard ON operation_logs; DROP FUNCTION reject_addition_audit()');
    });

    await t.test('a concurrent capture excludes intake without creating an order',async()=>{
      const lock=await pool.connect();
      try {
        await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['ainuoke-source:'+options.sourceKey]);
        const preview=await previewAdditions(additionBundle(),selected,await readBoundIdentities(pool));
        await assert.rejects(addOrders(pool,actor,{...options,selected,expectedPreview:preview.reviewHash,
          collect:async()=>additionBundle()}),/source_capture_busy/);
        assert.equal(await count('sales_orders'),1);
      } finally {
        await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['ainuoke-source:'+options.sourceKey]);
        lock.release();
      }
    });

    await t.test('operator revoked during source collection is checked again before writing',async()=>{
      const preview=await previewAdditions(additionBundle(),selected,await readBoundIdentities(pool));
      try {
        await assert.rejects(addOrders(pool,actor,{...options,selected,expectedPreview:preview.reviewHash,
          collect:async()=>{
            await pool.query('UPDATE app_users SET active=false WHERE id=$1',[actor.internalUserId]);
            return additionBundle();
          }}),/source_actor_unavailable/);
        assert.equal(await count('sales_orders'),1);
      } finally {await pool.query('UPDATE app_users SET active=true WHERE id=$1',[actor.internalUserId]);}
    });

    const source=additionBundle();
    const preview=await previewAdditions(source,selected,await readBoundIdentities(pool));
    const inserted=await addOrders(pool,actor,{...options,selected,expectedPreview:preview.reviewHash,collect:async()=>source});
    await t.test('selected order reuses formal UUID/order number and unchanged first order; exact retry is idempotent',async()=>{
      assert.equal(inserted.created,1);assert.equal(inserted.replayed,false);
      assert.equal(await count('sales_orders'),2);
      assert.equal(await count('ainuoke_sales_order_color_mirrors'),2);
      assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_type='AinuokeSourceAddition'")).rows[0].n,1);
      const linked=(await pool.query("SELECT external_id,sales_contract_no FROM sales_order_source_links WHERE sales_contract_no=$1",selected)).rows[0];
      assert.equal(linked.external_id,'synthetic-2');
      const retry=await addOrders(pool,actor,{...options,selected,expectedPreview:preview.reviewHash,collect:async()=>additionBundle()});
      assert.equal(retry.created,0);assert.equal(retry.replayed,true);
      assert.deepEqual(retry.orderIds,inserted.orderIds);
      assert.equal(await count('sales_orders'),2);
      assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_type='AinuokeSourceAddition'")).rows[0].n,1);
    });

    await t.test('mixed bound/new selection and visibility loss cannot create a partial batch',async()=>{
      const mixed=additionBundle(Date.now(),3,[1,2]);
      await assert.rejects(previewAdditions(mixed,[selected[0],syntheticOrder.salesContractNo+'-2'],await readBoundIdentities(pool)),/addition_partial_retry/);
      const missing=additionBundle(Date.now(),3,[2]);
      missing.discoveryBefore[0].rows.splice(0,1);missing.discoveryBefore[0].total=2;
      missing.discoveryAfter=structuredClone(missing.discoveryBefore);
      await assert.rejects(previewAdditions(missing,[syntheticOrder.salesContractNo+'-2'],await readBoundIdentities(pool)),/source_visibility_changed/);
      assert.equal(await count('sales_orders'),2);
    });
    await t.test('the next explicit capture persists material snapshots for both the old and new order',async()=>{
      const material=freshMaterialBundle();
      material.discoveryBefore=structuredClone(source.discoveryBefore);
      material.discoveryAfter=structuredClone(source.discoveryAfter);
      const pages=structuredClone(Object.values(material.materials)[0]);
      for(const page of pages) {
        page.queryContext={insideOrderNo:'SYNTHETIC-IN-OLD1'};
        for(const row of page.rows) {
          row.sourceRowIdentity+='-new-contract';
          row.values.ExpContractNo=selected[0];row.values.insideorderno='SYNTHETIC-IN-OLD1';
        }
      }
      material.materials[selected[0]]=pages;
      const result=await captureSource(pool,actor,{...options,maxAgeMs:600000,collect:async contracts=>{
        assert.deepEqual([...contracts].sort(),[syntheticOrder.salesContractNo,...selected].sort());
        return material;
      }});
      assert.equal(result.orders,2);
      const snapshots=(await pool.query('SELECT sales_order_id::text,sales_contract_no FROM ainuoke_material_source_snapshots WHERE run_id=$1',[result.runId])).rows;
      assert.equal(snapshots.length,2);
      assert.ok(snapshots.some(row=>row.sales_order_id===inserted.orderIds[0]&&row.sales_contract_no===selected[0]));
    });
    await t.test('a changed stored mirror cannot masquerade as an exact replay',async()=>{
      await pool.query('UPDATE ainuoke_sales_order_contract_mirrors SET quantity=999 WHERE sales_order_id=$1',[inserted.orderIds[0]]);
      await assert.rejects(addOrders(pool,actor,{...options,selected,expectedPreview:preview.reviewHash,
        collect:async()=>additionBundle()}),/addition_not_exact_retry/);
      assert.equal(await count('sales_orders'),2);
    });
  } finally {await pool.end();await db.stop();}
});
