import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanHistoryQuery, parsePlanListQuery, planPageInfo } from "./read-contract.js";
import { verifiedOrderBusinessSql } from "../sales-orders/business-verification-sql.js";

test("plan directories distinguish remaining orders and relevant groups, with bounded explicit paging", () => {
  assert.deepEqual(parsePlanListQuery(new URLSearchParams(), "orders"), { kind: "orders", allocation: "remaining", search: "", offset: 0, limit: 50 });
  assert.deepEqual(parsePlanListQuery(new URLSearchParams("status=disabled&search=%20组%20二%20&offset=100&limit=25"), "groups"), { kind: "groups", status: "disabled", search: "组 二", offset: 100, limit: 25 });
  assert.equal(parsePlanListQuery(new URLSearchParams("allocation=unknown"), "orders").kind, "orders");
});
test("unknown, duplicate, oversized, cross-directory and malformed read filters fail closed", () => {
  for (const query of ["status=all", "allocation=paid", "allocation=all&allocation=remaining", "offset=-1", "offset=100001", "offset=1e2", "limit=0", "limit=101", "salePrice=1", "search=%00", "search=" + "a".repeat(201), "search=" + Array(11).fill("a").join("+")]) {
    assert.throws(() => parsePlanListQuery(new URLSearchParams(query), "orders"));
  }
  for (const query of ["allocation=all", "status=active", "search=a&search=b"]) assert.throws(() => parsePlanListQuery(new URLSearchParams(query), "groups"));
});
test("history cursor uses exact positive versions, never timestamps or client floats", () => {
  assert.deepEqual(parsePlanHistoryQuery(new URLSearchParams()), { offset: 0, asOfVersion: null });
  assert.deepEqual(parsePlanHistoryQuery(new URLSearchParams("offset=50&asOfVersion=2147483647")), { offset: 50, asOfVersion: 2147483647 });
  for (const query of ["asOfVersion=0", "asOfVersion=1.5", "asOfVersion=2147483648", "asOfVersion=1&asOfVersion=2", "offset=1&offset=2", "date=2027-01-01"]) {
    assert.throws(() => parsePlanHistoryQuery(new URLSearchParams(query)));
  }
});
test("the old-schema contract expression omits missing processing relations rather than relying on CASE short circuit", () => {
  const sql = verifiedOrderBusinessSql(false, false);
  assert.equal(/processing_order|identity_profiles|attribution\./u.test(sql), false);
  assert.match(sql, /count\(\*\)[\s\S]*=1/u);
  assert.match(verifiedOrderBusinessSql(true), /so\.source_price_version_id=batch\.price_version_id/u);
});
test("directory pagination never promises a next page outside its supported offset window", () => {
  assert.equal(planPageInfo(100001, 99900, 100, 100).hasMore, true);
  assert.equal(planPageInfo(100001, 100000, 1, 100).hasMore, false);
  assert.equal(planPageInfo(10, 99, 0, 100).total, 10);
  assert.throws(() => planPageInfo(100101, 100000, 100, 100), (error: unknown) => (error as { code: string }).code === "production_order_projection_limit");
  assert.throws(() => planPageInfo(100051, 99999, 50, 50));
});
