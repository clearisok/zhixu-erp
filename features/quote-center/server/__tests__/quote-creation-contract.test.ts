import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { creationDate, parseCreationInput, parseCreationCommand, type CreationInput } from "../../../../server/quotes/creation-contract.js";
import { createQuoteCreationClient } from "../quote-creation-client.js";
import { parseCreationOrderSelection } from "../../../../server/quotes/creation-order-context.js";

const input: CreationInput = { source: null, quoteType: "processing", selection: { country: null, presetId: null }, fields: { brandId: "preserved-text-id", salespersonId: null, styleNo: "SYNTHETIC", styleName: "", quantity: null, garmentLeadDate: null, note: "" }, parameterOverrides: {} };
test("Creation DTO preserves existing TEXT identities, decimal/null/zero and date-only semantics", () => {
  assert.equal(parseCreationInput(input).fields.brandId, "preserved-text-id");
  assert.equal(parseCreationInput(input).fields.quantity, null);
  assert.equal(parseCreationInput({ ...input, fields: { ...input.fields, quantity: "0.000" } }).fields.quantity, "0");
  assert.equal(parseCreationInput({ ...input, fields: { ...input.fields, quantity: "9007199254740993.0000000001" } }).fields.quantity, "9007199254740993.0000000001");
  assert.equal(creationDate("2028-02-29"), "2028-02-29");
  for (const value of ["2026-02-29", "2026-04-31", "2026-12-01T00:00:00Z", "0000-01-01"]) assert.throws(() => creationDate(value));
});
test("Creation DTO rejects forged identities, source/Intake, price snapshots and non-string money", () => {
  for (const body of [{ ...input, actor: "admin" }, { ...input, source: { intakeId: randomUUID() } }, { ...input, quoteCode: "fake" }, { ...input, selection: { ...input.selection, presetName: "fake" } }, { ...input, fields: { ...input.fields, quantity: 0 } }, { ...input, parameterOverrides: { manufacturingCountry: "fake" } }]) assert.throws(() => parseCreationInput(body));
  assert.throws(() => parseCreationCommand({ ...input, clientRequestId: "short", previewId: randomUUID(), imageSelection: null }));
});
test("Creation client uses canonical commands and receipt read only; never legacy POST or PUT", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createQuoteCreationClient(async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ state: "pending", retryable: false })); });
  await client.preview(input);
  const command = { ...input, clientRequestId: randomUUID(), previewId: randomUUID(), imageSelection: null };
  await client.execute(command); await client.receipt(command.clientRequestId);
  assert.deepEqual(calls.map(call => call.url.split("?")[0]), ["/api/v1/quotes/creation-preview", "/api/v1/quotes/creation-workflows", `/api/v1/quotes/creation-receipts/${command.clientRequestId}`]);
  assert.equal(calls[2].init?.method, undefined);
  assert.ok(calls.every(call => call.init?.credentials === "include" && call.init.cache === "no-store"));
});
test("Order-context creation remains explicit; context and origin queries are GET-only selectors", async () => {
  const id = randomUUID(), requestId = randomUUID(), orderContext = { salesOrderId: id, fingerprint: "a".repeat(64) };
  assert.deepEqual(parseCreationOrderSelection(orderContext), orderContext);
  for (const value of [null, { ...orderContext, source: "client" }, { ...orderContext, fingerprint: "wrong" }, { ...orderContext, salesOrderId: "not-uuid" }]) assert.throws(() => parseCreationOrderSelection(value));
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createQuoteCreationClient(async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ state: "pending", retryable: false })); });
  await client.orderContext(id); await client.origin("preserved/text-id"); await client.defaults(requestId, orderContext); await client.receipt(requestId);
  assert.deepEqual(calls.map(c => c.init?.method ?? "GET"), ["GET", "GET", "POST", "GET"]);
  assert.equal(calls[1].url, "/api/v1/quotes/preserved%2Ftext-id/creation-origin");
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { clientRequestId: requestId, orderContext });
  await client.defaults(randomUUID()); assert.deepEqual(Object.keys(JSON.parse(String(calls[4].init?.body))), ["clientRequestId"]);
});
