import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import pg from 'pg';
import { createApp } from '../app.js';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { createQuoteDraft } from '../../features/quote-center/model/quote-view-model.js';
import { quoteSnapshotFromBrowser } from '../quotes/model.js';
import { createQuoteService } from '../quotes/service.js';

test('AUDIT: actual session HTTP proves legacy commercial reads still exposed (SECURITY PENDING)', async t => {
  const disposable = await startDisposablePostgres();
  assert.match(disposable.containerName, /^zhixu-pg-it-[a-f0-9]{12}$/);
  const url = await disposable.createDatabase('material_security_audit');
  assert.equal(new URL(url).hostname, '127.0.0.1');
  const pool = new pg.Pool({ connectionString: url });
  t.after(async () => { await pool.end(); await disposable.stop(); });
  await runMigrations(pool, resolve('database/migrations')); await synchronizePermissionCatalog(pool);
  const user = await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES ('material-audit',crypt('synthetic-only',gen_salt('bf',4)),'Synthetic','viewer',true) RETURNING id");
  await pool.query("INSERT INTO app_roles(id,name,description) VALUES ('material-audit','Synthetic','isolated')");
  await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES ($1,'material-audit')", [user.rows[0].id]);
  await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES ('material-audit','order.view'),('material-audit','quote.view')");
  const quote = createQuoteDraft('audit-quote', 'AUDIT-SYNTHETIC', '2026-10-11');
  const revision = quote.revisions[0]; const price = revision.priceVersions[0]; price.labor.value = 98765;
  await createQuoteService(pool).createAggregate(quoteSnapshotFromBrowser(quote));
  const order = await pool.query("INSERT INTO sales_orders(creation_source,source_quote_id,source_revision_id,source_price_version_id) VALUES ('quote',$1,$2,$3) RETURNING id", [quote.id,revision.revisionId,price.id]);
  const terms = await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,customer_confirmed_price,confirmed_labor_price,labor_currency) VALUES ('quote',$1,$2,$3,12345,67890,'USD') RETURNING id", [quote.id,revision.revisionId,price.id]);
  await pool.query('INSERT INTO confirmed_commercial_terms_sales_orders(sales_order_id,confirmed_commercial_terms_id) VALUES ($1,$2)', [order.rows[0].id,terms.rows[0].id]);
  const server = createServer(createApp({pool,allowedOrigins:['http://127.0.0.1'],security:{secureCookies:false,sessionTtlSeconds:60}}));
  await new Promise<void>(done => server.listen(0,'127.0.0.1',done)); t.after(() => new Promise<void>(done => server.close(() => done())));
  const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1','X-Zhixu-Request':'1'},body:JSON.stringify({username:'material-audit',password:'synthetic-only'})});
  assert.equal(login.status,200); const cookie = login.headers.get('set-cookie')!.split(';')[0];
  for (const path of [`/api/v1/sales-orders/${order.rows[0].id}/confirmed-commercial-terms`, `/api/v1/quotes/${quote.id}/revisions/${revision.revisionId}/price-versions/${price.id}/confirmed-commercial-terms`]) {
    const response = await fetch(base+path,{headers:{Cookie:cookie}}); assert.equal(response.status,200);
    const body = await response.json(); assert.equal(body.confirmedCommercialTerms.current.customerConfirmedPrice,'12345'); assert.equal(body.confirmedCommercialTerms.current.confirmedLaborPrice,'67890');
  }
  const aggregate = await fetch(base+`/api/v1/quotes/${quote.id}`,{headers:{Cookie:cookie}}); assert.equal(aggregate.status,200);
  assert.ok((await aggregate.text()).includes('98765'), 'actual Quote cost field was not redacted by quote.view-only actor');
  // These assertions document a real unresolved exposure; they are not production safety assertions.
});
