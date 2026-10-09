import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ExcelJS from "exceljs";

import { adaptAinuokeContractApiSnapshots, buildAinuokeMirrorFromApi } from "../features/ainuoke-sync/source/ainuoke-contract-api-adapter.ts";
import { buildAinuokeMirror } from "../features/ainuoke-sync/source/ainuoke-contract-source.ts";
import { parseColorDetailsWorkbook, parseSalesContractsWorkbook } from "../features/ainuoke-sync/parser/ainuoke-excel-parser.ts";
import { validateAinuokeSyncState } from "../features/ainuoke-sync/model/ainuoke.ts";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const contractSnapshot = fixture("ainuoke-api-contract-6086103.redacted.json");
const colorSnapshot = fixture("ainuoke-api-contract-6086997.redacted.json");

test("6086103 API adapter follows verified field labels without inventing PO", () => {
  const source = adaptAinuokeContractApiSnapshots({ contractSnapshots: [contractSnapshot], colorSnapshots: [colorSnapshot] });
  assert.equal(source.contracts.length, 1);
  assert.deepEqual(source.contracts[0], {
    sourceKind: "api",
    reportId: "6086103",
    sourceRowIdentity: "6086103:sha256:contract-redacted",
    snapshotHash: "snapshot-contract-redacted",
    fetchedAt: "2026-09-09T08:00:00.000Z",
    sourceHash: source.contracts[0].sourceHash,
    salesContractNo: "SC-API-001",
    statusRaw: "执行中",
    companyName: "COMPANY-A",
    customerName: "CUSTOMER-A",
    brandRaw: "BRAND-A",
    styleNoRaw: "STYLE-100",
    factoryStyleNo: "D1935",
    poNo: "",
    quantity: 100,
    contractDate: "2026-08-01",
    contractDeliveryDate: "2026-10-01",
  });
  assert.notEqual(source.contracts[0].poNo, contractSnapshot.rows[0].values.QuotationNo);
});

test("6086997 API adapter collapses material-join duplicates and keeps sizes empty", () => {
  const source = adaptAinuokeContractApiSnapshots({ contractSnapshots: [contractSnapshot], colorSnapshots: [colorSnapshot] });
  assert.equal(source.colorRows.length, 2);
  assert.deepEqual(source.colorRows.map((row) => [row.colorName, row.quantity, row.sizes]), [["RED", 50, []], ["BLUE", 50, []]]);
  assert.ok(source.colorRows.every((row) => row.sourceKind === "api" && row.sourceRowIdentity.startsWith("6086997:aggregate:")));
  assert.ok(source.colorRows.every((row) => row.poNo === "" && row.deliveryDate === null));
});

test("API source trace identity is stable across source row ordering", () => {
  const original = adaptAinuokeContractApiSnapshots({ contractSnapshots: [contractSnapshot], colorSnapshots: [colorSnapshot] });
  const reversedSnapshot = { ...colorSnapshot, rows: [...colorSnapshot.rows].reverse() };
  const reversed = adaptAinuokeContractApiSnapshots({ contractSnapshots: [contractSnapshot], colorSnapshots: [reversedSnapshot] });
  const traces = (source) => source.colorRows.map((row) => [row.colorName, row.sourceRowIdentity, row.sourceHash]).sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(traces(reversed), traces(original));
});

test("API adapter fails closed for missing required fields and duplicate source identity", () => {
  const missingBillNo = structuredClone(contractSnapshot);
  delete missingBillNo.rows[0].values.BillNo;
  assert.throws(() => adaptAinuokeContractApiSnapshots({ contractSnapshots: [missingBillNo], colorSnapshots: [colorSnapshot] }), /6086103.*BillNo/);
  const repeatedIdentity = structuredClone(colorSnapshot);
  repeatedIdentity.rows[1].sourceRowIdentity = repeatedIdentity.rows[0].sourceRowIdentity;
  assert.throws(() => adaptAinuokeContractApiSnapshots({ contractSnapshots: [contractSnapshot], colorSnapshots: [repeatedIdentity] }), /source row identity 重复/);
});

test("Excel and API adapters produce equivalent core mirror fields with different source trace", async () => {
  const salesWorkbook = new ExcelJS.Workbook();
  const salesSheet = salesWorkbook.addWorksheet("销售合同");
  salesSheet.addRow(["销售合同号", "客户品牌", "款号", "工厂款号", "数量", "交货期", "状态", "公司抬头", "客户", "合同日期"]);
  salesSheet.addRow(["SC-API-001", "BRAND-A", "STYLE-100", "D1935", 100, "2026-10-01", "执行中", "COMPANY-A", "CUSTOMER-A", "2026-08-01"]);
  const colorWorkbook = new ExcelJS.Workbook();
  const colorSheet = colorWorkbook.addWorksheet("成衣分色分码明细");
  colorSheet.addRow(["销售合同号", "款号", "工厂款号", "PO", "颜色", "数量", "交期"]);
  colorSheet.addRow(["SC-API-001", "STYLE-100", "D1935", "", "RED", 50, ""]);
  colorSheet.addRow(["SC-API-001", "STYLE-100", "D1935", "", "BLUE", 50, ""]);
  const [excelContracts, excelColors] = await Promise.all([
    parseSalesContractsWorkbook(await salesWorkbook.xlsx.writeBuffer(), "sales.xlsx"),
    parseColorDetailsWorkbook(await colorWorkbook.xlsx.writeBuffer(), "colors.xlsx"),
  ]);
  const excelMirror = buildAinuokeMirror({ contracts: excelContracts, colorRows: excelColors, syncedAt: "2026-09-09T09:00:00.000Z" })[0];
  const apiMirror = buildAinuokeMirrorFromApi({ contractSnapshots: [contractSnapshot], colorSnapshots: [colorSnapshot], syncedAt: "2026-09-09T09:00:00.000Z" }).contracts[0];
  const core = (mirror) => ({ salesContractNo: mirror.salesContractNo, strictStyleKey: mirror.strictStyleKey, baseStyleKey: mirror.baseStyleKey, brandNormalized: mirror.brandNormalized, quantity: mirror.quantity, contractDeliveryDate: mirror.contractDeliveryDate, colorQuantity: mirror.colorQuantity, colorLines: mirror.colorLines.map(({ colorName, quantity, deliveryDate }) => ({ colorName, quantity, deliveryDate })), deliveryLines: mirror.deliveryLines, validationStatus: mirror.validationStatus });
  assert.deepEqual(core(apiMirror), core(excelMirror));
  assert.equal(excelMirror.sourceKind, "excel");
  assert.equal(apiMirror.sourceKind, "api");
});

test("legacy Excel trace remains readable without a fabricated sourceKind", () => {
  const mirror = buildAinuokeMirrorFromApi({ contractSnapshots: [contractSnapshot], colorSnapshots: [colorSnapshot], syncedAt: "2026-09-09T09:00:00.000Z" }).contracts[0];
  const legacy = { ...mirror, sourceKind: undefined, sourceFile: "legacy.xlsx", sourceSheet: "销售合同", sourceRow: 2, sourceHash: "legacy-hash" };
  delete legacy.reportId;
  delete legacy.sourceRowIdentity;
  delete legacy.snapshotHash;
  delete legacy.fetchedAt;
  assert.doesNotThrow(() => validateAinuokeSyncState({ contracts: [legacy], reviews: [], importRuns: [] }));
});

test("legacy adapter rejects incomplete or changing snapshots independently of client", () => {
  for (const patch of [{ total: contractSnapshot.total + 1 }, { page: 2 }, { schemaVersion: "unknown" }, { pageSize: 0 }]) {
    assert.throws(() => adaptAinuokeContractApiSnapshots({ contractSnapshots: [{ ...contractSnapshot, ...patch }], colorSnapshots: [colorSnapshot] }), /Source 协议|分页/);
  }
  const blankIdentity = structuredClone(contractSnapshot);
  blankIdentity.rows[0].sourceRowIdentity = " ";
  assert.throws(() => adaptAinuokeContractApiSnapshots({ contractSnapshots: [blankIdentity], colorSnapshots: [colorSnapshot] }), /source row identity/);
});

test("legacy quantity mapping keeps missing/null distinct from explicit zero", () => {
  for (const value of [null, undefined, "", " ", true]) {
    const snapshot = structuredClone(contractSnapshot);
    snapshot.rows[0].values.Num = value;
    assert.throws(() => adaptAinuokeContractApiSnapshots({ contractSnapshots: [snapshot], colorSnapshots: [colorSnapshot] }), /数量无效/);
  }
  const zero = structuredClone(contractSnapshot);
  zero.rows[0].values.Num = 0;
  assert.equal(adaptAinuokeContractApiSnapshots({ contractSnapshots: [zero], colorSnapshots: [colorSnapshot] }).contracts[0].quantity, 0);
});

test("redacted API fixtures contain no credential or token material", () => {
  const raw = JSON.stringify({ contractSnapshot, colorSnapshot }).toLocaleLowerCase();
  for (const forbidden of ["password", "jwttoken", "sessionid", "authorization", "kaijin_my_token", "rungingsysid"]) assert.equal(raw.includes(forbidden), false);
});
