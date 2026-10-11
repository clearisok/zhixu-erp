import assert from "node:assert/strict";
import test from "node:test";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";

const keys = ["commercial.sale.view", "commercial.sale.edit", "commercial.labor.view", "commercial.labor.edit"];

test("commercial RBAC: existing and new trusted administrators, ordinary roles and live revocation", async t => {
  const x = await startCommercialSecurityFixture(); t.after(x.close);
  const ordinary = await x.user("ordinary-rbac", ["quote.view", "quote.cost.view", "quote.cost.edit", "quote.confirm", "order.edit"]);
  await x.pool.query("INSERT INTO app_roles(id,name,description) VALUES ('role-server-admin','Existing trusted server role','existing')");
  const before = (await x.pool.query("SELECT * FROM app_user_roles ORDER BY user_id,role_id")).rows;
  await synchronizePermissionCatalog(x.pool);
  assert.deepEqual((await x.pool.query("SELECT permission_key FROM app_role_permissions WHERE role_id='role-server-admin' ORDER BY permission_key")).rows.map(r => r.permission_key), [...keys].sort());
  await synchronizePermissionCatalog(x.pool);
  assert.equal((await x.pool.query("SELECT count(*)::int n FROM app_role_permissions WHERE role_id='role-server-admin'")).rows[0].n, 4);
  assert.deepEqual((await x.pool.query("SELECT * FROM app_user_roles ORDER BY user_id,role_id")).rows, before);
  const me = await x.request("/api/v1/auth/permissions", ordinary);
  assert.equal(me.response.status, 200);
  assert.equal(keys.some(key => me.text.includes(key)), false);
  await bootstrapAdmin(x.pool, {username:"new-rbac-admin",displayName:"Synthetic admin",password:"synthetic-admin-only"});
  assert.equal((await x.pool.query("SELECT count(*)::int n FROM app_user_roles u JOIN app_users a ON a.id=u.user_id JOIN app_role_permissions p ON p.role_id=u.role_id WHERE a.username='new-rbac-admin' AND p.permission_key=ANY($1::text[])",[keys])).rows[0].n,4);
  // Direct SQL here represents explicit trusted role configuration in an isolated DB.
  await x.pool.query("INSERT INTO app_role_permissions VALUES ('ordinary-rbac','commercial.sale.view')");
  assert.ok((await x.request("/api/v1/auth/permissions", ordinary)).text.includes("commercial.sale.view"));
  await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='ordinary-rbac' AND permission_key='commercial.sale.view'");
  await synchronizePermissionCatalog(x.pool);
  assert.equal((await x.request("/api/v1/auth/permissions", ordinary)).text.includes("commercial.sale.view"), false);
});
