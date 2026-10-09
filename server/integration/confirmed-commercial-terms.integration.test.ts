import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import { createQuoteDraft } from "../../features/quote-center/model/quote-view-model.js";
import { createApp } from "../app.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import {
  readConfirmedCommercialTermsByQuote,
  readConfirmedCommercialTermsBySalesOrder,
  updateConfirmedCommercialTermsByQuote,
  updateConfirmedCommercialTermsBySalesOrder,
} from "../confirmed-commercial-terms/service.js";
import { runMigrations } from "../db/migration-runner.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteService } from "../quotes/service.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { startDisposablePostgres } from "./postgres-container.js";

const { Pool } = pg;
const browserOrigin = "http://127.0.0.1:3001";

async function seedUser(
  pool: pg.Pool,
  username: string,
  permissions: string[],
): Promise<{ identity: TrustedIdentity; password: string }> {
  const password = `test-${username}-password`;
  const user = await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO app_users(username, password_hash, display_name, role, active)
     VALUES ($1, crypt($2, gen_salt('bf', 4)), $3, 'viewer', true)
     RETURNING id::text, public_id::text`,
    [username, password, `Terms ${username}`],
  );
  const roleId = `role-terms-${username}`;
  await pool.query("INSERT INTO app_roles(id, name, description) VALUES ($1, $2, 'terms fixture')", [roleId, roleId]);
  for (const permission of permissions) {
    await pool.query("INSERT INTO app_role_permissions(role_id, permission_key) VALUES ($1, $2)", [roleId, permission]);
  }
  await pool.query("INSERT INTO app_user_roles(user_id, role_id) VALUES ($1::bigint, $2)", [user.rows[0].id, roleId]);
  return {
    password,
    identity: {
      internalUserId: user.rows[0].id,
      userId: user.rows[0].public_id,
      username,
      userName: `Terms ${username}`,
      permissions: permissions as TrustedIdentity["permissions"],
    },
  };
}

async function startApi(pool: pg.Pool) {
  const server = createServer(createApp({
    pool,
    allowedOrigins: [browserOrigin],
    security: { secureCookies: false, sessionTtlSeconds: 3600 },
  }));
  await new Promise<void>((resolve_) => server.listen(0, "127.0.0.1", resolve_));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve_, reject) => server.close((error) => error ? reject(error) : resolve_())),
  };
}

async function login(baseUrl: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: browserOrigin, "X-Zhixu-Request": "1" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

function termsPath(salesOrderId: string): string {
  return `/api/v1/sales-orders/${salesOrderId}/confirmed-commercial-terms`;
}

function quotePath(quoteId: string, revisionId: string, priceVersionId: string): string {
  return `/api/v1/quotes/${quoteId}/revisions/${revisionId}/price-versions/${priceVersionId}/confirmed-commercial-terms`;
}

async function apiRequest<T = Record<string, unknown>>(baseUrl: string, path: string, options: {
  cookie?: string;
  method?: string;
  origin?: string;
  trustedHeader?: boolean;
  body?: Record<string, unknown>;
} = {}): Promise<{ response: Response; payload: T }> {
  const headers = new Headers();
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.origin) headers.set("Origin", options.origin);
  if (options.trustedHeader) headers.set("X-Zhixu-Request", "1");
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { response, payload: await response.json() as T };
}

test("ConfirmedCommercialTerms uses disposable PostgreSQL and one shared current truth", async (t) => {
  const postgres = await startDisposablePostgres();
  const databaseUrl = await postgres.createDatabase("confirmed_commercial_terms");
  const pool = new Pool({ connectionString: databaseUrl });
  t.after(async () => {
    await pool.end();
    await postgres.stop();
  });

  const firstMigration = await runMigrations(pool, resolve("database/migrations"));
  assert.deepEqual(firstMigration.applied, [
    "0001_trusted_auth_rbac_operation_logs.sql",
    "0002_sales_order_foundation.sql",
    "0003_sales_order_number_sequence.sql",
    "0004_confirmed_commercial_terms.sql",
    "0005_quote_foundation.sql",
    "0006_quote_number_sequence.sql",
    "0007_quote_master_settings.sql",
    "0008_quote_attachments.sql",
  ]);
  const rerun = await runMigrations(pool, resolve("database/migrations"));
  assert.deepEqual(rerun.applied, []);
  assert.ok(rerun.skipped.includes("0004_confirmed_commercial_terms.sql"));
  assert.ok(rerun.skipped.includes("0005_quote_foundation.sql"));
  assert.ok(rerun.skipped.includes("0006_quote_number_sequence.sql"));
  const ledger = await pool.query<{ checksum: string }>("SELECT checksum FROM schema_migrations WHERE version = 4");
  assert.match(ledger.rows[0].checksum, /^[a-f0-9]{64}$/u);

  await synchronizePermissionCatalog(pool);
  const editor = await seedUser(pool, "terms-editor", ["order.view", "order.edit", "quote.view", "quote.confirm"]);
  const viewer = await seedUser(pool, "terms-viewer", ["order.view", "quote.view"]);
  const denied = await seedUser(pool, "terms-denied", []);

  const provenance = { quoteId: "quote-exact-1", revisionId: "revision-exact-1", priceVersionId: "price-exact-1" };
  const quoteDraft = createQuoteDraft(provenance.quoteId, "QT-C4.2-INTEGRATION", "2026-09-14");
  const currentRevision = quoteDraft.revisions[0];
  currentRevision.revisionId = provenance.revisionId;
  currentRevision.revisionLabel = "V2";
  currentRevision.mainlineVersion = 2;
  currentRevision.parentRevisionId = "revision-historical-1";
  currentRevision.priceVersions[0].id = provenance.priceVersionId;
  currentRevision.baseInfo = { ...currentRevision.baseInfo, brandId: "synthetic-brand", salespersonId: "synthetic-person", quoteStyleNo: "SYNTHETIC", styleName: "Synthetic terms" };
  currentRevision.priceVersions[0].quantity = 0;
  currentRevision.priceVersions[0].labor.value = 0;
  currentRevision.priceVersions[0].pricingParameters.laborCurrency = "CNY";
  currentRevision.priceVersions[0].confirmation = {
    quotedGarmentPrice: 120,
    confirmedGarmentPrice: 118,
    quotedLaborPrice: 8,
    confirmedLaborPrice: 7.5,
    note: "Q1 current snapshot",
    confirmedAt: "2026-09-14T00:00:00.000Z",
  };
  const historicalRevision = structuredClone(currentRevision);
  historicalRevision.revisionId = "revision-historical-1";
  historicalRevision.revisionLabel = "V1";
  historicalRevision.mainlineVersion = 1;
  historicalRevision.parentRevisionId = null;
  historicalRevision.readOnly = true;
  historicalRevision.priceVersions[0].id = "price-historical-1";
  historicalRevision.priceVersions[0].confirmation = {
    quotedGarmentPrice: 110,
    confirmedGarmentPrice: 108,
    quotedLaborPrice: 7,
    confirmedLaborPrice: 6.5,
    note: "Q1 historical snapshot",
    confirmedAt: "2026-09-01T00:00:00.000Z",
  };
  quoteDraft.defaultRevisionId = provenance.revisionId;
  quoteDraft.currentRevisionId = provenance.revisionId;
  quoteDraft.revisions = [historicalRevision, currentRevision];
  const quoteService = createQuoteService(pool);
  const q1Created = await quoteService.createAggregate(quoteSnapshotFromBrowser(quoteDraft));
  let q1BeforeTerms = await quoteService.getById(provenance.quoteId);
  assert.deepEqual(q1BeforeTerms, q1Created);
  const firstOrder = await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: provenance.quoteId, sourceRevisionId: provenance.revisionId, sourcePriceVersionId: provenance.priceVersionId });
  const secondOrder = await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: provenance.quoteId, sourceRevisionId: provenance.revisionId, sourcePriceVersionId: provenance.priceVersionId });
  const currencyUnsetProvenance = { quoteId: "quote-currency-unset", revisionId: "revision-currency-unset", priceVersionId: "price-currency-unset" };
  const currencyUnsetOrder = await createSalesOrder(pool, { creationSource: "quote", sourceQuoteId: currencyUnsetProvenance.quoteId, sourceRevisionId: currencyUnsetProvenance.revisionId, sourcePriceVersionId: currencyUnsetProvenance.priceVersionId });
  const currencyQuote = structuredClone(quoteDraft);
  currencyQuote.id = currencyUnsetProvenance.quoteId; currencyQuote.quoteCode = "QT-SYNTHETIC-CURRENCY";
  currencyQuote.revisions = [structuredClone(currentRevision)];
  currencyQuote.revisions[0].revisionId = currencyUnsetProvenance.revisionId;
  currencyQuote.revisions[0].parentRevisionId = null;
  currencyQuote.revisions[0].baseInfo.quoteType = "processing";
  currencyQuote.revisions[0].priceVersions[0].id = currencyUnsetProvenance.priceVersionId;
  currencyQuote.revisions[0].priceVersions[0].pricingParameters.laborCurrency = "USD";
  currencyQuote.defaultRevisionId = currencyUnsetProvenance.revisionId; currencyQuote.currentRevisionId = currencyUnsetProvenance.revisionId;
  await quoteService.createAggregate(quoteSnapshotFromBrowser(currencyQuote));
  const unlinkedOrder = (await createAinuokeSalesOrder(pool, editor.identity, {
    source: {
      sourceId: "terms-source-unlinked",
      sourceRowIdentity: "6086103:terms-source-unlinked",
      salesContractNo: "SC-TERMS-UNLINKED",
      insideOrderNo: "INSIDE-TERMS-UNLINKED",
      lifecycleStatusRaw: "生效",
      contractDate: "2026-09-01",
      contractDeliveryDate: "2026-10-01",
      styleNo: "STYLE-TERMS",
      companyNameSnapshot: "COMPANY-TERMS",
      customerNameSnapshot: "CUSTOMER-TERMS",
      brandNameSnapshot: "BRAND-TERMS",
      quantity: 321.5,
      sourceHash: "terms-contract-hash",
      fetchedAt: "2026-09-14T00:00:00.000Z",
    },
    colors: [{ sourceLineIdentity: "6087105:terms-blue", colorName: "BLUE", quantity: 321.5, deliveryDate: null, sourceHash: "terms-color-hash" }],
  })).salesOrder;
  const rollbackOrder = await createSalesOrder(pool, { creationSource: "manual" });
  const sequenceBefore = await pool.query<{ last_value: string; is_called: boolean }>("SELECT last_value::text, is_called FROM sales_order_number_seq");
  const sourceBefore = await pool.query<{ contracts: number; colors: number; quantity: string }>(
    `SELECT
       (SELECT count(*)::int FROM ainuoke_sales_order_contract_mirrors) AS contracts,
       (SELECT count(*)::int FROM ainuoke_sales_order_color_mirrors) AS colors,
       (SELECT quantity::text FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id = $1::uuid) AS quantity`,
    [unlinkedOrder.id],
  );

  await t.test("multiple SalesOrders with exact provenance share one context across both surfaces", async () => {
    const quoteUpdated = await updateConfirmedCommercialTermsByQuote(pool, editor.identity, provenance, {
      expectedQuoteVersion: 1,
      expectedVersion: 0,
      customerConfirmedPrice: "125.50",
      confirmedLaborPrice: "8.75",
      laborCurrency: "CNY",
    });
    assert.equal(quoteUpdated.linkage, "linked");
    assert.equal(quoteUpdated.associatedSalesOrderIds.length, 2);
    assert.equal(quoteUpdated.current?.version, 1);
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, firstOrder.id)).current?.customerConfirmedPrice, "125.50");
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, secondOrder.id)).current?.id, quoteUpdated.current?.id);

    await assert.rejects(
      () => updateConfirmedCommercialTermsBySalesOrder(pool, editor.identity, firstOrder.id, {
        expectedVersion: 1,
        customerConfirmedPrice: "125.50",
        confirmedLaborPrice: "8.75",
        laborCurrency: "USD",
      }),
      (error: unknown) => (error as { status?: number; code?: string }).status === 409
        && (error as { code?: string }).code === "linked_labor_currency_order_conflict",
    );
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, firstOrder.id)).current?.laborCurrency, "CNY");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM operation_logs WHERE entity_type = 'ConfirmedCommercialTerms'")).rows[0].count, 1);

    const orderUpdated = await updateConfirmedCommercialTermsBySalesOrder(pool, editor.identity, secondOrder.id, {
      expectedVersion: 1,
      customerConfirmedPrice: "126.00",
      confirmedLaborPrice: "9.00",
      laborCurrency: "CNY",
    });
    assert.equal(orderUpdated.current?.version, 2);
    const quoteRead = await readConfirmedCommercialTermsByQuote(pool, provenance);
    assert.equal(quoteRead.current?.customerConfirmedPrice, "126.00");
    assert.equal(quoteRead.current?.confirmedLaborPrice, "9.00");
    assert.equal(quoteRead.current?.laborCurrency, "CNY");
    const currencySource = (await quoteService.getById(provenance.quoteId))!;
    currencySource.quote.revisions.find(r => r.revisionId === provenance.revisionId)!.priceVersions[0].pricingParameters.laborCurrency = "USD";
    await createQuoteService(pool).saveAggregate(currencySource.quote, currencySource.version);
    q1BeforeTerms = await quoteService.getById(provenance.quoteId); // explicit saved-PV edit, not a terms mutation
    const currencyUpdated = await updateConfirmedCommercialTermsByQuote(pool, editor.identity, provenance, {
      expectedQuoteVersion: 2,
      expectedVersion: 2,
      customerConfirmedPrice: "126.00",
      confirmedLaborPrice: "9.00",
      laborCurrency: "USD",
    });
    assert.equal(currencyUpdated.current?.version, 3);
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, firstOrder.id)).current?.laborCurrency, "USD");
    await assert.rejects(
      () => updateConfirmedCommercialTermsBySalesOrder(pool, editor.identity, secondOrder.id, {
        expectedVersion: 3,
        customerConfirmedPrice: "126.00",
        confirmedLaborPrice: "9.00",
        laborCurrency: "CNY",
      }),
      (error: unknown) => (error as { status?: number; code?: string }).status === 409
        && (error as { code?: string }).code === "linked_labor_currency_order_conflict",
    );
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, secondOrder.id)).current?.laborCurrency, "USD");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM confirmed_commercial_terms")).rows[0].count, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM confirmed_commercial_terms_sales_orders")).rows[0].count, 2);
    const logs = await pool.query<{ actor_public_id: string; changes: Array<{ field: string; beforeValue: string | number | null; afterValue: string | number | null }> }>(
      "SELECT actor_public_id::text, changes FROM operation_logs WHERE entity_type = 'ConfirmedCommercialTerms' ORDER BY created_at",
    );
    assert.equal(logs.rowCount, 3);
    assert.ok(logs.rows.every((row) => row.actor_public_id === editor.identity.userId));
    assert.deepEqual(logs.rows[1].changes.find((change) => change.field === "customerConfirmedPrice"), {
      field: "customerConfirmedPrice", beforeValue: "125.50", afterValue: "126.00",
    });
    assert.deepEqual(logs.rows[1].changes.find((change) => change.field === "confirmedLaborPrice"), {
      field: "confirmedLaborPrice", beforeValue: "8.75", afterValue: "9.00",
    });
    assert.deepEqual(logs.rows[2].changes.find((change) => change.field === "laborCurrency"), {
      field: "laborCurrency", beforeValue: "CNY", afterValue: "USD",
    });
    await assert.rejects(
      () => updateConfirmedCommercialTermsByQuote(pool, editor.identity, provenance, {
        expectedQuoteVersion: 2,
        expectedVersion: 1,
        customerConfirmedPrice: "130",
        confirmedLaborPrice: "10",
        laborCurrency: "CNY",
      }),
      (error: unknown) => (error as { status?: number }).status === 409,
    );
  });

  await t.test("linked Order cannot invent labor currency and Quote can establish it", async () => {
    const logsBefore = (await pool.query("SELECT count(*)::int AS count FROM operation_logs WHERE entity_type = 'ConfirmedCommercialTerms'")).rows[0].count;
    await assert.rejects(
      () => updateConfirmedCommercialTermsBySalesOrder(pool, editor.identity, currencyUnsetOrder.id, {
        expectedVersion: 0,
        customerConfirmedPrice: null,
        confirmedLaborPrice: "7.25",
        laborCurrency: "CNY",
      }),
      (error: unknown) => (error as { status?: number; code?: string }).status === 409
        && (error as { code?: string }).code === "linked_labor_currency_not_established",
    );
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, currencyUnsetOrder.id)).current, null);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM operation_logs WHERE entity_type = 'ConfirmedCommercialTerms'")).rows[0].count, logsBefore);

    const establishedByQuote = await updateConfirmedCommercialTermsByQuote(pool, editor.identity, currencyUnsetProvenance, {
      expectedQuoteVersion: 1,
      expectedVersion: 0,
      customerConfirmedPrice: null,
      confirmedLaborPrice: "7.25",
      laborCurrency: "USD",
    });
    assert.equal(establishedByQuote.current?.laborCurrency, "USD");
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, currencyUnsetOrder.id)).current?.laborCurrency, "USD");
  });

  await t.test("null is distinct from zero and an unlinked order never gains Quote provenance", async () => {
    const initial = await readConfirmedCommercialTermsBySalesOrder(pool, unlinkedOrder.id);
    assert.equal(initial.current, null);
    const zero = await updateConfirmedCommercialTermsBySalesOrder(pool, editor.identity, unlinkedOrder.id, {
      expectedVersion: 0,
      customerConfirmedPrice: "0",
      confirmedLaborPrice: "0",
      laborCurrency: "CNY",
    });
    assert.equal(zero.linkage, "unlinked");
    assert.equal(zero.current?.customerConfirmedPrice, "0");
    assert.equal(zero.current?.confirmedLaborPrice, "0");
    const explicitUsd = await updateConfirmedCommercialTermsBySalesOrder(pool, editor.identity, unlinkedOrder.id, {
      expectedVersion: 1,
      customerConfirmedPrice: "0",
      confirmedLaborPrice: "0",
      laborCurrency: "USD",
    });
    assert.equal(explicitUsd.current?.laborCurrency, "USD");
    const provenanceAfter = await pool.query("SELECT source_quote_id, source_revision_id, source_price_version_id FROM sales_orders WHERE id = $1", [unlinkedOrder.id]);
    assert.deepEqual(provenanceAfter.rows[0], { source_quote_id: null, source_revision_id: null, source_price_version_id: null });
    await assert.rejects(
      () => pool.query("UPDATE confirmed_commercial_terms SET customer_confirmed_price = -1, version = version + 1 WHERE id = $1", [zero.current?.id]),
      /check constraint/iu,
    );
    await assert.rejects(
      () => pool.query("DELETE FROM confirmed_commercial_terms WHERE id = $1", [zero.current?.id]),
      /cannot be deleted/iu,
    );
  });

  await t.test("audit failure rolls back terms and association atomically", async () => {
    const invalidActor: TrustedIdentity = { ...editor.identity, internalUserId: "9223372036854775807" };
    await assert.rejects(() => updateConfirmedCommercialTermsBySalesOrder(pool, invalidActor, rollbackOrder.id, {
      expectedVersion: 0,
      customerConfirmedPrice: "10",
      confirmedLaborPrice: "2",
      laborCurrency: "CNY",
    }));
    assert.equal((await readConfirmedCommercialTermsBySalesOrder(pool, rollbackOrder.id)).current, null);
  });

  await t.test("API enforces trusted session, RBAC, exact linkage, mutation boundary and typed input", async () => {
    const api = await startApi(pool);
    t.after(async () => api.close());
    const editorCookie = await login(api.baseUrl, editor.identity.username, editor.password);
    const viewerCookie = await login(api.baseUrl, viewer.identity.username, viewer.password);
    const deniedCookie = await login(api.baseUrl, denied.identity.username, denied.password);

    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id))).response.status, 401);
    assert.equal((await apiRequest(api.baseUrl, quotePath(provenance.quoteId, provenance.revisionId, provenance.priceVersionId))).response.status, 401);
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: deniedCookie })).response.status, 403);
    assert.equal((await apiRequest(api.baseUrl, quotePath(provenance.quoteId, provenance.revisionId, provenance.priceVersionId), { cookie: deniedCookie })).response.status, 403);
    assert.equal((await apiRequest(api.baseUrl, termsPath("00000000-0000-0000-0000-000000000000"), { cookie: editorCookie })).response.status, 404);
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: viewerCookie })).response.status, 200);

    const mutationBody = { expectedVersion: 3, customerConfirmedPrice: "127.000000000000000001", confirmedLaborPrice: "9.500000000000000001", laborCurrency: "USD" };
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: editorCookie, method: "PATCH", body: mutationBody })).response.status, 403);
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: editorCookie, method: "PATCH", origin: "http://evil.invalid", trustedHeader: true, body: mutationBody })).response.status, 403);
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: viewerCookie, method: "PATCH", origin: browserOrigin, trustedHeader: true, body: mutationBody })).response.status, 403);
    assert.equal((await apiRequest(api.baseUrl, quotePath(...Object.values(provenance) as [string, string, string]), { cookie: viewerCookie, method: "PATCH", origin: browserOrigin, trustedHeader: true, body: mutationBody })).response.status, 403);
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: editorCookie, method: "PATCH", origin: browserOrigin, trustedHeader: true, body: { ...mutationBody, actor: "spoof" } })).response.status, 400);
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: editorCookie, method: "PATCH", origin: browserOrigin, trustedHeader: true, body: { ...mutationBody, customerConfirmedPrice: -1 } })).response.status, 400);
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: editorCookie, method: "PATCH", origin: browserOrigin, trustedHeader: true, body: { ...mutationBody, confirmedLaborPrice: "1", laborCurrency: null } })).response.status, 400);

    const currencyConflict = await apiRequest<{ error: { code: string } }>(api.baseUrl, termsPath(firstOrder.id), {
      cookie: editorCookie,
      method: "PATCH",
      origin: browserOrigin,
      trustedHeader: true,
      body: { ...mutationBody, laborCurrency: "CNY" },
    });
    assert.equal(currencyConflict.response.status, 409);
    assert.equal(currencyConflict.payload.error.code, "linked_labor_currency_order_conflict");

    const success = await apiRequest<{ confirmedCommercialTerms: { current: { version: number } } }>(api.baseUrl, termsPath(firstOrder.id), { cookie: editorCookie, method: "PATCH", origin: browserOrigin, trustedHeader: true, body: mutationBody });
    assert.equal(success.response.status, 200);
    assert.equal(success.payload.confirmedCommercialTerms.current.version, 4);
    const exactRoundTrip = await readConfirmedCommercialTermsBySalesOrder(pool, secondOrder.id);
    assert.equal(exactRoundTrip.current?.customerConfirmedPrice, "127.000000000000000001");
    assert.equal(exactRoundTrip.current?.confirmedLaborPrice, "9.500000000000000001");
    const trustedApiLog = await pool.query<{ actor_public_id: string; context: { mutationSurface: string; salesOrderIds: string[] } }>(
      `SELECT actor_public_id::text, context FROM operation_logs
       WHERE entity_type = 'ConfirmedCommercialTerms'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    assert.equal(trustedApiLog.rows[0].actor_public_id, editor.identity.userId);
    assert.equal(trustedApiLog.rows[0].context.mutationSurface, "order");
    assert.ok(trustedApiLog.rows[0].context.salesOrderIds.includes(firstOrder.id));
    assert.equal((await apiRequest(api.baseUrl, termsPath(firstOrder.id), { cookie: editorCookie, method: "PATCH", origin: browserOrigin, trustedHeader: true, body: mutationBody })).response.status, 409);

    const unlinkedQuote = await apiRequest<{ confirmedCommercialTerms: { linkage: string } }>(api.baseUrl, quotePath("quote-none", "revision-none", "price-none"), { cookie: editorCookie });
    assert.equal(unlinkedQuote.response.status, 200);
    assert.equal(unlinkedQuote.payload.confirmedCommercialTerms.linkage, "unlinked");
    assert.equal((await apiRequest(api.baseUrl, quotePath("quote-none", "revision-none", "price-none"), { cookie: editorCookie, method: "PATCH", origin: browserOrigin, trustedHeader: true, body: { ...mutationBody, expectedQuoteVersion: 1, expectedVersion: 0 } })).response.status, 409);
    assert.equal((await apiRequest<{ confirmedCommercialTerms: { linkage: string } }>(api.baseUrl, quotePath("quote-exact", provenance.revisionId, provenance.priceVersionId), { cookie: editorCookie })).payload.confirmedCommercialTerms.linkage, "unlinked");
    assert.equal((await apiRequest(api.baseUrl, "/api/v1/confirmed-commercial-terms", { cookie: editorCookie })).response.status, 404);
  });

  const sequenceAfter = await pool.query<{ last_value: string; is_called: boolean }>("SELECT last_value::text, is_called FROM sales_order_number_seq");
  assert.deepEqual(sequenceAfter.rows[0], sequenceBefore.rows[0]);
  const sourceAfter = await pool.query<{ contracts: number; colors: number; quantity: string }>(
    `SELECT
       (SELECT count(*)::int FROM ainuoke_sales_order_contract_mirrors) AS contracts,
       (SELECT count(*)::int FROM ainuoke_sales_order_color_mirrors) AS colors,
       (SELECT quantity::text FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id = $1::uuid) AS quantity`,
    [unlinkedOrder.id],
  );
  assert.deepEqual(sourceAfter.rows[0], sourceBefore.rows[0]);
  const salesOrders = await pool.query<{ version: number }>("SELECT version FROM sales_orders");
  assert.ok(salesOrders.rows.every((row) => row.version === 1));
  await t.test("shared current terms preserve exact Q1 provenance and never mutate Quote snapshots", async () => {
    const q1AfterTerms = await quoteService.getById(provenance.quoteId);
    assert.deepEqual(q1AfterTerms, q1BeforeTerms);
    assert.equal(q1AfterTerms?.version, 2); // only the explicit saved currency edit advanced Quote
    assert.equal(q1AfterTerms?.quote.defaultRevisionId, provenance.revisionId);
    assert.equal(q1AfterTerms?.quote.revisions[1].priceVersions[0].id, provenance.priceVersionId);
    assert.equal(q1AfterTerms?.quote.revisions[0].priceVersions[0].confirmation?.confirmedGarmentPrice, "108");
    assert.equal(q1AfterTerms?.quote.revisions[1].priceVersions[0].confirmation?.confirmedGarmentPrice, "118");
    const termsProvenance = await pool.query<{ quote_id: string; revision_id: string; price_version_id: string }>(
      "SELECT quote_id, revision_id, price_version_id FROM confirmed_commercial_terms WHERE quote_id = $1",
      [provenance.quoteId],
    );
    assert.deepEqual(termsProvenance.rows[0], {
      quote_id: provenance.quoteId,
      revision_id: provenance.revisionId,
      price_version_id: provenance.priceVersionId,
    });
  });
});
