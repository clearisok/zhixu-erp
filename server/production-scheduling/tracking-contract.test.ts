import assert from "node:assert/strict";
import test from "node:test";
import { savedCommandPermissions } from "./command-transaction.js";
import { parsePlanCommand } from "./contract.js";
import { parseExecutionCommand } from "./execution-contract.js";
import { ORDER_TRACKING_WRITE_PERMISSIONS, parseOrderTrackingCommand, parseOrderTrackingHistoryQuery, parseOrderTrackingIntent } from "./tracking-contract.js";

const orderId = "4e1692c4-a329-4db4-91ea-bc668a9fe30d", requestId = "1ac9371b-b2d1-46ce-8c39-cec30707fe33";
const intent = { action: "set_order_tracking", orderId, expectedVersion: 0, data: { supplyHubId: null, remark: " 保留中文及空格 " } };
test("tracking preserves explicit null and text, has its own strict identity within shared command permissions", () => {
  assert.deepEqual(parseOrderTrackingIntent(intent), intent);
  assert.deepEqual(parseOrderTrackingIntent({ ...intent, data: { supplyHubId: requestId.toUpperCase(), remark: "" } }).data, { supplyHubId: requestId, remark: "" });
  const command = { requestId, intent, previewHash: "a".repeat(64) };
  assert.deepEqual(parseOrderTrackingCommand(command), command);
  assert.deepEqual(savedCommandPermissions(command), ORDER_TRACKING_WRITE_PERMISSIONS);
  assert.throws(() => parsePlanCommand(command)); assert.throws(() => parseExecutionCommand(command));
});
test("tracking rejects actor, prices, dates, quantities, IDs and partial or noncanonical versions", () => {
  for (const extra of ["actorId", "trackingId", "version", "actualDate", "quantity", "price", "completedQuantity", "expectedPlanVersion"]) assert.throws(() => parseOrderTrackingIntent({ ...intent, [extra]: requestId }));
  for (const value of [-1, 0.1, "0", null, NaN, Infinity, 2147483647]) assert.throws(() => parseOrderTrackingIntent({ ...intent, expectedVersion: value }));
  for (const value of [undefined, "", "1", [], {}]) assert.throws(() => parseOrderTrackingIntent({ ...intent, data: { supplyHubId: value, remark: "" } }));
  for (const value of [null, undefined, "x".repeat(2001), "\0", "\uD800"]) assert.throws(() => parseOrderTrackingIntent({ ...intent, data: { supplyHubId: null, remark: value } }));
  assert.throws(() => parseOrderTrackingIntent({ ...intent, data: { ...intent.data, price: 10 } }));
  assert.throws(() => parseOrderTrackingCommand({ requestId, intent, previewHash: "A".repeat(64) }));
  assert.equal(parseOrderTrackingIntent({ ...intent, data: { supplyHubId: null, remark: "😀".repeat(1000) } }).data.remark.length, 2000);
});
test("tracking history has bounded stable anchors and no unknown/duplicate query fields", () => {
  assert.deepEqual(parseOrderTrackingHistoryQuery(new URLSearchParams()), { offset: 0, asOfVersion: null });
  assert.deepEqual(parseOrderTrackingHistoryQuery(new URLSearchParams("offset=50&asOfVersion=0")), { offset: 50, asOfVersion: 0 });
  for (const raw of ["offset=-1", "offset=1.1", "offset=100001", "asOfVersion=2147483648", "offset=0&offset=0", "actor=x", "asOfVersion="]) assert.throws(() => parseOrderTrackingHistoryQuery(new URLSearchParams(raw)));
});
