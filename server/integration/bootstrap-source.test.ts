import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AinuokeBridgeError, createAinuokeBridgeClient } from "../../features/ainuoke-api/client/ainuoke-bridge-client.js";
import type {
  AinuokeOrderDiscoveryQuery,
  AinuokeReportSnapshot,
  AinuokeSalesContractQuery,
} from "../../features/ainuoke-api/model/ainuoke-api.js";
import {
  BOOTSTRAP_BRIDGE_MAX_ATTEMPTS,
  BOOTSTRAP_BRIDGE_RETRY_BACKOFF_MS,
  BootstrapAinuokeAccountPreconditionError,
  buildFreshSalesOrderBootstrapPlan,
  createBootstrapBridgeTransport,
  type BootstrapBridgeTransportRetry,
} from "../sales-orders/bootstrap-source.js";

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error("redacted transport failure"), { code });
}

const noSleep = async (): Promise<void> => undefined;

test("bootstrap Bridge transport retries the first TypeError then returns the Response", async () => {
  let calls = 0;
  const retries: BootstrapBridgeTransportRetry[] = [];
  const delays: number[] = [];
  const transport = createBootstrapBridgeTransport({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response(null, { status: 204 });
    },
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    onRetry: (retry) => retries.push(retry),
  });

  assert.equal((await transport.fetchImpl("http://bridge.test/v1/session")).status, 204);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [250]);
  assert.deepEqual(retries, [{
    attempt: 1,
    maxAttempts: 4,
    errorClass: "TypeError",
    transportCode: null,
    endpointPath: "/v1/session",
  }]);
  assert.equal(transport.getRetryCount(), 1);
});

test("bootstrap Bridge transport supports nested Undici codes and succeeds on attempt three", async () => {
  let calls = 0;
  const retries: BootstrapBridgeTransportRetry[] = [];
  const transport = createBootstrapBridgeTransport({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw codedError("ECONNRESET");
      if (calls === 2) throw Object.assign(new TypeError("fetch failed"), {
        cause: codedError("UND_ERR_SOCKET"),
      });
      return new Response(null, { status: 204 });
    },
    sleep: noSleep,
    onRetry: (retry) => retries.push(retry),
  });

  await transport.fetchImpl("http://bridge.test/v1/ainuoke/reports/order_discovery/query");
  assert.equal(calls, 3);
  assert.deepEqual(retries.map((retry) => retry.transportCode), ["ECONNRESET", "UND_ERR_SOCKET"]);
  assert.equal(transport.getRetryCount(), 2);
});

test("bootstrap Bridge transport stops after four total attempts", async () => {
  let calls = 0;
  const retries: BootstrapBridgeTransportRetry[] = [];
  const delays: number[] = [];
  const transport = createBootstrapBridgeTransport({
    fetchImpl: async () => {
      calls += 1;
      throw new TypeError("fetch failed");
    },
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    onRetry: (retry) => retries.push(retry),
  });

  await assert.rejects(() => transport.fetchImpl("http://bridge.test/v1/session"), TypeError);
  assert.equal(calls, BOOTSTRAP_BRIDGE_MAX_ATTEMPTS);
  assert.equal(retries.length, 3);
  assert.deepEqual(delays, [...BOOTSTRAP_BRIDGE_RETRY_BACKOFF_MS]);
  assert.equal(transport.getRetryCount(), 3);
});

test("HTTP and Bridge errors are returned without transport retry", async () => {
  let calls = 0;
  const transport = createBootstrapBridgeTransport({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ csrfToken: "csrf" }, 201, { "Set-Cookie": "session=one; Path=/" });
      return jsonResponse({ error: { code: "bad_request", message: "redacted" } }, 400);
    },
    sleep: noSleep,
  });
  const client = createAinuokeBridgeClient({ baseUrl: "http://bridge.test", fetchImpl: transport.fetchImpl });

  await assert.rejects(
    () => client.readOrderDiscoveryPage("user-1"),
    (error: unknown) => error instanceof AinuokeBridgeError && error.code === "bad_request",
  );
  assert.equal(calls, 2);
  assert.equal(transport.getRetryCount(), 0);

  let validationCalls = 0;
  const validationTransport = createBootstrapBridgeTransport({
    fetchImpl: async () => {
      validationCalls += 1;
      throw new AinuokeBridgeError("report_contract_mismatch", "redacted");
    },
    sleep: noSleep,
  });
  await assert.rejects(
    () => validationTransport.fetchImpl("http://bridge.test/v1/ainuoke/reports/order_discovery/query"),
    (error: unknown) => error instanceof AinuokeBridgeError && error.code === "report_contract_mismatch",
  );
  assert.equal(validationCalls, 1);
  assert.equal(validationTransport.getRetryCount(), 0);
});

test("paging and data contract errors are not transport retries", async () => {
  let calls = 0;
  const transport = createBootstrapBridgeTransport({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ csrfToken: "csrf" }, 201);
      return jsonResponse({
        schemaVersion: "ainuoke-direct-read.v2",
        reportId: "6087105",
        fetchedAt: "2026-09-12T00:00:00.000Z",
        page: 1,
        pageSize: 50,
        total: 0,
        queryContext: {},
        snapshotHash: "wrong-report",
        rows: [],
      });
    },
    sleep: noSleep,
  });
  const client = createAinuokeBridgeClient({ baseUrl: "http://bridge.test", fetchImpl: transport.fetchImpl });

  await assert.rejects(
    () => client.readAllOrderDiscoveryPages("user-1", { pageSize: 50 }),
    (error: unknown) => error instanceof AinuokeBridgeError && error.code === "discovery_contract_mismatch",
  );
  assert.equal(calls, 2);
  assert.equal(transport.getRetryCount(), 0);
});

test("cookie changes only after a received Response and is preserved across a retry", async () => {
  const cookies: Array<string | null> = [];
  let calls = 0;
  const transport = createBootstrapBridgeTransport({
    fetchImpl: async (_input, init) => {
      calls += 1;
      cookies.push(new Headers(init?.headers).get("cookie"));
      if (calls === 1) return new Response(null, { status: 204, headers: { "Set-Cookie": "session=one; Path=/" } });
      if (calls === 2) throw codedError("EPIPE");
      if (calls === 3) return new Response(null, { status: 204, headers: { "Set-Cookie": "session=two; Path=/" } });
      return new Response(null, { status: 204 });
    },
    sleep: noSleep,
  });

  await transport.fetchImpl("http://bridge.test/first");
  await transport.fetchImpl("http://bridge.test/second");
  await transport.fetchImpl("http://bridge.test/third");
  assert.deepEqual(cookies, [null, "session=one", "session=one", "session=two"]);
  assert.equal(transport.getRetryCount(), 1);
});

test("bootstrap source transport has no PostgreSQL write path", async () => {
  const source = await readFile(new URL("../sales-orders/bootstrap-source.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /createAinuokeSalesOrder|\b(?:INSERT|UPDATE|DELETE|nextval)\b/iu);
});

function discoverySnapshot(): AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery> {
  return {
    schemaVersion: "ainuoke-direct-read.v2",
    reportId: "6086103",
    fetchedAt: "2026-09-12T00:00:00.000Z",
    page: 1,
    pageSize: 50,
    total: 1,
    queryContext: {},
    snapshotHash: "raw-discovery-hash",
    rows: [{
      sourceRowIdentity: "6086103:sha256:source-1",
      values: {
        id: "source-1",
        InsideOrderNo: "INSIDE-1",
        BillNo: "PI-001",
        Status: "draft",
        ContractDate: "2026-09-01",
        DeliveryDate: "2026-10-01",
        GoodsDesc: "STYLE-1",
        CompanyName: "Fixture Company",
        CustomerName: "Fixture Customer",
        Brand: "Fixture Brand",
        Num: 10,
      },
    }],
  };
}

function detailSnapshot(): AinuokeReportSnapshot<AinuokeSalesContractQuery> {
  return {
    schemaVersion: "ainuoke-direct-read.v2",
    reportId: "6087105",
    fetchedAt: "2026-09-12T00:00:00.000Z",
    page: 1,
    pageSize: 50,
    total: 1,
    queryContext: { salesContractNo: "PI-001" },
    snapshotHash: "raw-detail-hash",
    rows: [{
      sourceRowIdentity: "6087105:sha256:color-1",
      values: {
        id: "color-1",
        BillNo: "PI-001",
        GoodsNo: "STYLE-1",
        insideorderno: "INSIDE-1",
        CnColor: "RED",
        SizeNum: 10,
        DeliveryDate: "2026-10-01",
        SizeRule: "S",
        Size1: 10,
      },
    }],
  };
}

function planFetch(failFirstDiscovery: boolean): typeof fetch {
  let discoveryFailed = false;
  return async (input) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input)).pathname;
    if (pathname === "/v1/session") {
      return jsonResponse({ csrfToken: "csrf" }, 201, { "Set-Cookie": "session=one; Path=/" });
    }
    if (pathname === "/v1/ainuoke/account") {
      return jsonResponse({
        username: "Fixture User",
        configured: true,
        status: "verified",
        lastVerifiedAt: "2026-09-12T00:00:00.000Z",
        lastSuccessfulLoginAt: "2026-09-12T00:00:00.000Z",
        lastErrorCode: null,
      });
    }
    if (pathname === "/v1/ainuoke/reports/order_discovery/query") {
      if (failFirstDiscovery && !discoveryFailed) {
        discoveryFailed = true;
        throw new TypeError("fetch failed");
      }
      return jsonResponse(discoverySnapshot());
    }
    if (pathname === "/v1/ainuoke/reports/garment_color_size_details/query") {
      return jsonResponse(detailSnapshot());
    }
    throw new Error(`Unexpected fixture path ${pathname}`);
  };
}

test("bootstrap source rejects an unconfigured Ainuoke user before Discovery", async () => {
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input)).pathname;
    paths.push(pathname);
    if (pathname === "/v1/session") return jsonResponse({ csrfToken: "csrf" }, 201);
    if (pathname === "/v1/ainuoke/account") {
      return jsonResponse({
        username: null,
        configured: false,
        status: "not_configured",
        lastVerifiedAt: null,
        lastSuccessfulLoginAt: null,
        lastErrorCode: null,
      });
    }
    throw new Error(`Unexpected fixture path ${pathname}`);
  };

  await assert.rejects(
    () => buildFreshSalesOrderBootstrapPlan({
      ainuokeUserId: "unconfigured-user",
      bridgeUrl: "http://bridge.test",
      fetchImpl,
      transportSleep: noSleep,
    }),
    (error: unknown) => {
      assert.ok(error instanceof BootstrapAinuokeAccountPreconditionError);
      assert.deepEqual(error.report, {
        event: "bootstrap_ainuoke_account_precondition_failed",
        configured: false,
        status: "not_configured",
        bridgeCode: "account_not_configured",
      });
      assert.deepEqual(Object.keys(error.report).sort(), ["bridgeCode", "configured", "event", "status"]);
      return true;
    },
  );
  assert.deepEqual(paths, ["/v1/session", "/v1/ainuoke/account"]);
});

test("a recovered transport failure leaves the stable Preview and report-page accounting unchanged", async () => {
  const baseline = await buildFreshSalesOrderBootstrapPlan({
    ainuokeUserId: "user-1",
    bridgeUrl: "http://bridge.test",
    fetchImpl: planFetch(false),
    transportSleep: noSleep,
  });
  const retried = await buildFreshSalesOrderBootstrapPlan({
    ainuokeUserId: "user-1",
    bridgeUrl: "http://bridge.test",
    fetchImpl: planFetch(true),
    transportSleep: noSleep,
  });

  assert.equal(retried.preview.snapshot.stable, true);
  assert.equal(retried.preview.readyForDisposablePostgres, true);
  assert.deepEqual(retried.preview, baseline.preview);
  assert.deepEqual(retried.reads, baseline.reads);
  assert.deepEqual(retried.reads, {
    total: 3,
    byReport: { "6086103": 2, "6087105": 1, "6086997": 0, "6087050": 0 },
  });
  assert.equal(baseline.transportRetries, 0);
  assert.equal(retried.transportRetries, 1);
});
