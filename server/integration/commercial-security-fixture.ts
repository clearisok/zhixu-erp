import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import pg from "pg";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteService } from "../quotes/service.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";

export async function startCommercialSecurityFixture() {
  const disposable = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await disposable.createDatabase("commercial_security") });
  let server: ReturnType<typeof createServer> | undefined;
  const close = async () => { if(server) await new Promise<void>(done => server!.close(() => done())); await pool.end(); await disposable.stop(); };
  try {
    await runMigrations(pool, resolve("database/migrations"));
    await synchronizePermissionCatalog(pool);
    const quote = createSyntheticQuoteFixture("synthetic-commercial-security");
    for(const revision of quote.revisions) {
      revision.imageAttachmentIds=[]; revision.fileAttachmentIds=[]; revision.styleImageAttachmentId=null;
      for(const pv of revision.priceVersions) pv.labor.value=98765;
    }
    const record = await createQuoteService(pool).createAggregate(quoteSnapshotFromBrowser(quote));
    const revision=quote.revisions.at(-1)!; const pv=revision.priceVersions[0];
    const order=(await pool.query("INSERT INTO sales_orders(creation_source,source_quote_id,source_revision_id,source_price_version_id) VALUES ('quote',$1,$2,$3) RETURNING id",[quote.id,revision.revisionId,pv.id])).rows[0];
    const terms=(await pool.query("INSERT INTO confirmed_commercial_terms(ownership_scope,quote_id,revision_id,price_version_id,customer_confirmed_price,confirmed_labor_price,labor_currency) VALUES ('quote',$1,$2,$3,12345,67890,'USD') RETURNING id",[quote.id,revision.revisionId,pv.id])).rows[0];
    await pool.query("INSERT INTO confirmed_commercial_terms_sales_orders(sales_order_id,confirmed_commercial_terms_id) VALUES ($1,$2)",[order.id,terms.id]);
    const origin="http://127.0.0.1";
    server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:60}}));
    await new Promise<void>(done=>server!.listen(0,"127.0.0.1",done));
    const address=server.address(); assert.ok(address&&typeof address==="object");
    const base=`http://127.0.0.1:${address.port}`;
    const request=async(path:string,cookie?:string,body?:unknown,method="GET")=> {
      const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{"Content-Type":"application/json",Origin:origin,"X-Zhixu-Request":"1"}:{})},body:body===undefined?undefined:JSON.stringify(body)});
      const text=await response.text(); return{response,text,body:JSON.parse(text)};
    };
    const user=async(username:string,permissions:PermissionKey[])=> {
      const row=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES ($1,crypt('synthetic-only',gen_salt('bf',4)),'Synthetic','viewer',true) RETURNING id",[username])).rows[0];
      await pool.query("INSERT INTO app_roles(id,name,description) VALUES ($1,$1,'isolated security')",[username]);
      await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES ($1,$2)",[row.id,username]);
      for(const key of permissions) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES ($1,$2)",[username,key]);
      const result=await request("/api/v1/auth/login",undefined,{username,password:"synthetic-only"},"POST"); assert.equal(result.response.status,200);
      return result.response.headers.get("set-cookie")!.split(";")[0];
    };
    return { pool, record, quotePath:`/api/v1/quotes/${quote.id}`, orderPath:`/api/v1/sales-orders/${order.id}/confirmed-commercial-terms`, quoteTermsPath:`/api/v1/quotes/${quote.id}/revisions/${revision.revisionId}/price-versions/${pv.id}/confirmed-commercial-terms`, user,request,close };
  } catch(error) { await close(); throw error; }
}