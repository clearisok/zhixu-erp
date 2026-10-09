import assert from "node:assert/strict";
import test from "node:test";
import {
  ConfirmedCommercialTermsServerError,
  createConfirmedCommercialTermsServerClient,
} from "../client.js";

const dto = {
  linkage: "linked" as const,
  scope: "quote" as const,
  quoteProvenance: { quoteId: "quote-1", revisionId: "revision-1", priceVersionId: "price-1" },
  associatedSalesOrderIds: ["order-1"],
  current: {
    id: "terms-1",
    customerConfirmedPrice: "12.30",
    customerConfirmedPriceCurrency: "CNY" as const,
    confirmedLaborPrice: "3.25",
    laborCurrency: "USD" as const,
    version: 2,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T01:00:00.000Z",
  },
};

test("commercial terms client uses exact provenance and trusted mutation headers", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = createConfirmedCommercialTermsServerClient({
    baseUrl: "http://server.test",
    fetchImpl: (async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ confirmedCommercialTerms: dto }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
  });

  assert.deepEqual(await client.getByQuote("quote-1", "revision-1", "price-1"), dto);
  await client.updateBySalesOrder("order-1", {
    expectedVersion: 2,
    customerConfirmedPrice: "13.00",
    confirmedLaborPrice: "4.00",
    laborCurrency: "CNY",
  });

  assert.match(requests[0].url, /quotes\/quote-1\/revisions\/revision-1\/price-versions\/price-1/u);
  assert.equal(requests[0].init?.method, "GET");
  assert.equal(requests[1].init?.method, "PATCH");
  assert.equal(new Headers(requests[1].init?.headers).get("X-Zhixu-Request"), "1");
  assert.equal(requests[1].init?.credentials, "include");
});

test("Quote terms mutation serializes both CAS versions; mismatched provenance rejects read/write", async () => {
  let body = "";
  const client = createConfirmedCommercialTermsServerClient({ fetchImpl: (async (_url, init) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ confirmedCommercialTerms: dto }));
  }) as typeof fetch });
  await client.updateByQuote("quote-1", "revision-1", "price-1", { expectedVersion: 2, expectedQuoteVersion: 9, customerConfirmedPrice: "0", confirmedLaborPrice: "1.23456789", laborCurrency: "USD" });
  assert.deepEqual(JSON.parse(body), { expectedVersion: 2, expectedQuoteVersion: 9, customerConfirmedPrice: "0", confirmedLaborPrice: "1.23456789", laborCurrency: "USD" });
  await assert.rejects(client.getByQuote("other", "revision-1", "price-1"), { code: "confirmed_commercial_terms_provenance_mismatch" });
  await assert.rejects(client.updateByQuote("quote-1", "revision-1", "other", { expectedVersion: 2, expectedQuoteVersion: 9, customerConfirmedPrice: "0", confirmedLaborPrice: "0", laborCurrency: "USD" }), { code: "confirmed_commercial_terms_provenance_mismatch" });
});

test("commercial terms client preserves safe conflict status and code", async () => {
  const client = createConfirmedCommercialTermsServerClient({
    fetchImpl: (async () => new Response(JSON.stringify({
      error: { code: "confirmed_commercial_terms_version_conflict", message: "stale" },
    }), { status: 409, headers: { "Content-Type": "application/json" } })) as typeof fetch,
  });
  await assert.rejects(
    () => client.getBySalesOrder("order-1"),
    (error: unknown) => error instanceof ConfirmedCommercialTermsServerError
      && error.status === 409
      && error.code === "confirmed_commercial_terms_version_conflict",
  );
});

test("incomplete linkage response is unknown, never inferred unlinked or a snapshot fallback", async () => {
  for (const malformed of [{ ...dto, linkage: undefined }, { ...dto, linkage: "unlinked" }, { ...dto, associatedSalesOrderIds: [] }]) {
    const client = createConfirmedCommercialTermsServerClient({ fetchImpl: (async () => new Response(JSON.stringify({ confirmedCommercialTerms: malformed }))) as typeof fetch });
    await assert.rejects(client.getByQuote("quote-1", "revision-1", "price-1"), { code: "confirmed_commercial_terms_provenance_mismatch" });
  }
});
