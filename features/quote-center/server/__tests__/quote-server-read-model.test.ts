import assert from "node:assert/strict";
import test from "node:test";
import { createQuoteServerClient, QuoteServerError } from "../quote-server-client";
import { classifyQuoteServerReadFailure, displayServerDecimal } from "../quote-server-read-model";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

test("read presentation preserves null, explicit zero, and arbitrary decimal precision", () => {
  assert.equal(displayServerDecimal(null), "未填写（null）");
  assert.equal(displayServerDecimal("0"), "0");
  assert.equal(displayServerDecimal("12345678901234567890.12345678901234567890"), "12345678901234567890.12345678901234567890");
});

test("read failures classify trusted auth and resource states without Browser fallback", () => {
  assert.equal(classifyQuoteServerReadFailure(new QuoteServerError(401, "authentication_required", "ignored")), "unauthorized");
  assert.equal(classifyQuoteServerReadFailure(new QuoteServerError(403, "permission_denied", "ignored")), "forbidden");
  assert.equal(classifyQuoteServerReadFailure(new QuoteServerError(404, "quote_not_found", "ignored")), "not-found");
  assert.equal(classifyQuoteServerReadFailure(new TypeError("network")), "unavailable");
});

test("typed Quote read client uses credentialed GET and preserves DTO decimal strings", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const precise = "12345678901234567890.12345678901234567890";
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).includes("/api/v1/quotes/quote-1")) {
      return jsonResponse({ quote: { quote: { id: "quote-1", revisions: [{ priceVersions: [{ quantity: precise, labor: { value: "0" } }] }] }, version: 7 } });
    }
    return jsonResponse({ quotes: [{ id: "quote-1", quoteCode: "Q-1", defaultRevisionId: "rev-1", version: 7 }], page: { limit: 50, offset: 0, count: 1 } });
  };
  const client = createQuoteServerClient({ fetchImpl });

  const list = await client.list({ limit: 50, offset: 0 });
  const detail = await client.getById("quote-1");
  assert.ok(detail.costVisibility !== "restricted");

  assert.equal(list.quotes[0].quoteCode, "Q-1");
  assert.equal((detail.quote.revisions[0].priceVersions[0].quantity), precise);
  assert.equal(detail.quote.revisions[0].priceVersions[0].labor.value, "0");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.init?.method, undefined);
    assert.equal(call.init?.credentials, "include");
    assert.equal(call.init?.cache, "no-store");
  }
});
