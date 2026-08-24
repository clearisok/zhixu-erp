import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { copyPriceVersion, nullableTotalPriceVersionQuantity } from "../features/quote-center/model/quote-calculations.ts";
import { BASE_PRICE_VERSION_NAME, createQuoteDraft, getDefaultRevision, normalizeSinglePriceVersionName } from "../features/quote-center/model/quote-view-model.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("新报价唯一价格版本命名为基础价格且数量保持空值", () => {
  const revision = getDefaultRevision(createQuoteDraft("single-price", "QT-SINGLE", "2026-08-21"));
  assert.equal(revision.priceVersions.length, 1);
  assert.equal(revision.priceVersions[0].name, BASE_PRICE_VERSION_NAME);
  assert.equal(revision.priceVersions[0].quantity, null);
});

test("单价格版本数量直接保存在唯一 PriceVersion，创建第二版本不覆盖来源数量", () => {
  const revision = getDefaultRevision(createQuoteDraft("quantity", "QT-QUANTITY", "2026-08-21"));
  revision.priceVersions[0].quantity = 3000;
  const sourceVersions = normalizeSinglePriceVersionName(revision.priceVersions);
  const copied = copyPriceVersion(sourceVersions[0], { id: "stripe", name: "彩条", quantity: 2000, description: "面料成本不同" });
  const versions = [...sourceVersions, copied];
  assert.equal(versions[0].name, "基础价格");
  assert.equal(versions[0].quantity, 3000);
  assert.equal(versions[1].quantity, 2000);
  assert.equal(nullableTotalPriceVersionQuantity(versions), 5000);
});

test("总数量区分全部空值与明确的零", () => {
  const revision = getDefaultRevision(createQuoteDraft("nullable-quantity", "QT-NULLABLE", "2026-08-21"));
  assert.equal(nullableTotalPriceVersionQuantity(revision.priceVersions), null);
  revision.priceVersions[0].quantity = 0;
  assert.equal(nullableTotalPriceVersionQuantity(revision.priceVersions), 0);
});

test("单价格版本隐藏管理区并在基础信息显示可编辑数量", async () => {
  const [editor, baseInfo] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/quote-center/components/quote-base-info.tsx"),
  ]);
  assert.match(editor, /revision\.priceVersions\.length >= 2 && <PriceVersionSelector/);
  assert.match(editor, /openVersionModal\("copy", activeVersion\)\}>创建价格版本<\/Button>/);
  assert.match(baseInfo, /singlePriceVersion \? <FormItem label="数量">/);
  assert.match(baseInfo, /priceVersions: \[\{ \.\.\.singlePriceVersion, quantity \}\]/);
  assert.match(baseInfo, /NullableNumberInput[^>]+aria-label="数量"/);
});

test("多价格版本显示只读总数量，备注独占一行并使用共享紧凑间距", async () => {
  const [baseInfo, styles] = await Promise.all([
    read("features/quote-center/components/quote-base-info.tsx"),
    read("app/quote-center/quote-center.css"),
  ]);
  assert.match(baseInfo, /FormItem label="总数量" hint="由各价格版本数量自动汇总"/);
  assert.match(baseInfo, /totalQuantity === null \? "—"/);
  assert.match(baseInfo, /className="qc-control qc-readonly-value qc-quantity-summary"/);
  assert.match(baseInfo, /FormItem label="备注" className="qc-note-field"/);
  assert.match(styles, /--qc-form-row-gap: 14px/);
  assert.match(styles, /gap: var\(--qc-form-row-gap\) 17px/);
  assert.match(styles, /\.qc-note-field \{ grid-column: 1 \/ -1; \}/);
});
