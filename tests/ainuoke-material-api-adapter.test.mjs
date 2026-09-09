import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { adaptAinuokeMaterialApiSnapshots, AINUOKE_6087050_FIELD_MAP } from "../features/style-progress/source/ainuoke-material-api-adapter.ts";

const fixture = () => JSON.parse(fs.readFileSync(new URL("./fixtures/ainuoke-api-material-6087050.redacted.json", import.meta.url), "utf8"));

test("6087050 薄适配器映射真实字段并保留非 Excel API Source Trace", () => {
  const source = adaptAinuokeMaterialApiSnapshots(fixture());
  assert.equal(source.metadata.sourceKind, "api");
  assert.equal(source.metadata.reportId, "6087050");
  assert.equal(source.metadata.reportedTotal, 3);
  assert.equal(source.metadata.sourceRowCount, 3);
  assert.equal(source.metadata.pages.length, 2);
  const fabric = source.rows.find((row) => row.values.materialCode === "FABRIC-A");
  assert.equal(fabric.values.salesContractNo, "SC-REDACTED-001");
  assert.equal(fabric.values.materialType, "面料");
  assert.equal(fabric.values.plannedConsumption, 0.5);
  assert.equal(fabric.values.totalConsumption, 0.525);
  assert.equal(fabric.values.requiredQuantity, 50);
  assert.equal(fabric.values.purchaseQuantity, 50);
  assert.equal(fabric.values.inboundQuantity, 50);
  assert.equal(fabric.values.shipmentQuantity, 50);
  assert.equal(fabric.values.outboundQuantity, 50);
  assert.equal(fabric.values.actualConsumption, undefined);
  assert.deepEqual(fabric.trace, {
    sourceKind: "api",
    reportId: "6087050",
    sourceRowIdentity: "6087050:sha256:aaaaaaaa",
    snapshotHash: "page-one-redacted",
    fetchedAt: "2026-09-09T03:00:00.000Z",
    queryContext: { insideOrderNo: "D1935" },
    sourceSchemaVersion: "ainuoke-direct-read.v2",
  });
  for (const forbidden of ["fileName", "fileHash", "sheetName", "sourceRow"]) assert.equal(Object.hasOwn(fabric.trace, forbidden), false);
  assert.equal(AINUOKE_6087050_FIELD_MAP.actualConsumption, undefined);
});

test("全部分页合并与行顺序变化不改变 source identity", () => {
  const pages = fixture();
  const baseline = adaptAinuokeMaterialApiSnapshots(pages);
  const reordered = adaptAinuokeMaterialApiSnapshots([
    { ...pages[1], rows: [...pages[1].rows].reverse() },
    { ...pages[0], rows: [...pages[0].rows].reverse() },
  ]);
  const identities = (source) => source.rows.map((row) => row.trace.sourceRowIdentity);
  assert.deepEqual(identities(reordered), identities(baseline));
  assert.equal(reordered.metadata.sourceRowCount, 3);
});

test("分页边界变化不改变 source identity", () => {
  const pages = fixture();
  const rows = pages.flatMap((page) => page.rows);
  const regrouped = [
    { ...pages[0], pageSize: 1, rows: rows.slice(0, 1), snapshotHash: "regrouped-1" },
    { ...pages[1], page: 2, pageSize: 2, rows: rows.slice(1), snapshotHash: "regrouped-2" },
  ];
  const identities = (source) => source.rows.map((row) => row.trace.sourceRowIdentity);
  assert.deepEqual(identities(adaptAinuokeMaterialApiSnapshots(regrouped)), identities(adaptAinuokeMaterialApiSnapshots(pages)));
});

test("6087050 repeated upstream id 使用两个不同 source identity", () => {
  const source = adaptAinuokeMaterialApiSnapshots(fixture());
  const repeated = source.rows.filter((row) => row.rawFields.id === 71001);
  assert.equal(repeated.length, 2);
  assert.notEqual(repeated[0].trace.sourceRowIdentity, repeated[1].trace.sourceRowIdentity);
  assert.equal(source.metadata.repeatedUpstreamIdGroups, 1);
  assert.equal(source.metadata.sourceIdentityCollisions, 0);
});

test("相同 source row 重叠分页只去重，不制造 identity collision", () => {
  const pages = fixture();
  pages[1].rows.push(structuredClone(pages[0].rows[0]));
  pages[1].total = 4;
  pages[0].total = 4;
  const source = adaptAinuokeMaterialApiSnapshots(pages);
  assert.equal(source.rows.length, 3);
  assert.equal(source.metadata.duplicateSourceRowsPrevented, 1);
  assert.equal(source.metadata.sourceIdentityCollisions, 0);
});

test("错误 report、未完整分页、identity collision 与 secret 字段 fail closed", () => {
  const pages = fixture();
  assert.throws(() => adaptAinuokeMaterialApiSnapshots([{ ...pages[0], reportId: "6086103" }]), /缺少报表 6087050/);
  assert.throws(() => adaptAinuokeMaterialApiSnapshots([{ ...pages[0], total: 99 }]), /尚未读取全部分页/);
  const collision = fixture();
  collision[1].rows[0].sourceRowIdentity = collision[0].rows[0].sourceRowIdentity;
  assert.throws(() => adaptAinuokeMaterialApiSnapshots(collision), /identity collision/);
  const secret = fixture();
  secret[0].rows[0].values.jwtToken = "forbidden-fixture-secret";
  assert.throws(() => adaptAinuokeMaterialApiSnapshots(secret), /禁止字段/);
});

test("API Source fixture 与 adapter 不包含 credential/token/session", () => {
  const encoded = JSON.stringify(fixture());
  const source = fs.readFileSync(new URL("../features/style-progress/source/ainuoke-material-api-adapter.ts", import.meta.url), "utf8");
  assert.doesNotMatch(encoded.toLowerCase(), /password|credential-secret|jwt-secret|session-secret/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|commitImport|orderRepository|scheduling|closingRepository/);
});
