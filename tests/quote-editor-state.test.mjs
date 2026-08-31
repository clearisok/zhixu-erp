import assert from "node:assert/strict";
import test from "node:test";

import { createQuoteDraft } from "../features/quote-center/model/quote-view-model.ts";
import { copyPriceVersion, costLineAmount, sumCostLines } from "../features/quote-center/model/quote-calculations.ts";
import {
  createEmptyCostLine,
  createNavigationIntent,
  parseNumberDraft,
  patchCostLine,
  resolveDirtyChoice,
} from "../features/quote-center/model/quote-editor-state.ts";

test("空数字与明确的 0 保持为两个状态", () => {
  assert.equal(parseNumberDraft(""), null);
  assert.equal(parseNumberDraft("   "), null);
  assert.equal(parseNumberDraft("0"), 0);
  assert.equal(parseNumberDraft("0.0"), 0);
  assert.notEqual(parseNumberDraft(""), parseNumberDraft("0"));
});

test("数字编辑中间态可解析但不要求输入框立即格式化", () => {
  assert.equal(parseNumberDraft("1"), 1);
  assert.equal(parseNumberDraft("1."), 1);
  assert.equal(parseNumberDraft("1.25"), 1.25);
});

test("新报价和新增成本行的人工数字初始为空", () => {
  const quote = createQuoteDraft("draft-test", "QT-TEST", "2026-08-17");
  const revision = quote.revisions[0];
  assert.equal(revision.priceVersions[0].pricingParameters.usdCnyRate, null);
  assert.equal(revision.priceVersions[0].pricingParameters.markupRate, null);
  assert.equal(revision.priceVersions[0].quantity, null);
  assert.equal(revision.priceVersions[0].labor.value, null);
  const emptyLine = createEmptyCostLine("row-1");
  assert.ok(emptyLine.lineGroupId);
  const businessFields = Object.fromEntries(Object.entries(emptyLine).filter(([key]) => key !== "lineGroupId"));
  assert.deepEqual(businessFields, {
    id: "row-1", name: "", specification: "", usage: null, unit: "", lossRate: null, unitPrice: null,
  });
});

test("空成本按 0 参与预览，明确的 0 仍保存在模型中", () => {
  const empty = createEmptyCostLine("row-empty");
  assert.equal(costLineAmount(empty), 0);
  const explicitZero = { ...empty, usage: 0, lossRate: 0, unitPrice: 0 };
  assert.equal(costLineAmount(explicitZero), 0);
  assert.equal(explicitZero.usage, 0);
  assert.equal(empty.usage, null);
});

test("Placeholder 文案不进入成本行 View Model", () => {
  const line = createEmptyCostLine("row-placeholder");
  assert.equal(line.name, "");
  assert.equal(line.specification, "");
  assert.notEqual(line.name, "请输入面料名称");
  assert.notEqual(line.specification, "请输入规格");
});

test("编辑所有成本字段不会改变稳定 Row ID", () => {
  const original = createEmptyCostLine("stable-row-id");
  const updated = patchCostLine([original], "stable-row-id", {
    name: "40/2全棉精梳线", specification: "白色 16L", usage: 1, lossRate: 0.15, unitPrice: 10.5,
  })[0];
  assert.equal(updated.id, "stable-row-id");
});

test("复制 PriceVersion 为每条成本行生成新的独立 ID", () => {
  const source = {
    id: "source", name: "素色", quantity: 100, description: "",
    fabrics: [{ ...createEmptyCostLine("source-fabric"), name: "主面料" }],
    trims: [{ ...createEmptyCostLine("source-trim"), name: "纽扣" }],
    labor: { value: null, description: "" },
    otherCosts: [{ ...createEmptyCostLine("source-other"), name: "包装" }],
    confirmation: null,
  };
  const copied = copyPriceVersion(source, { id: "copy", name: "彩条", quantity: null, description: "" });
  assert.notEqual(copied.fabrics[0].id, source.fabrics[0].id);
  assert.notEqual(copied.trims[0].id, source.trims[0].id);
  assert.notEqual(copied.otherCosts[0].id, source.otherCosts[0].id);
});

test("面料和辅料小计覆盖空表、一行、多行、修改与删除", () => {
  const first = { ...createEmptyCostLine("first"), usage: 2, lossRate: 10, unitPrice: 10 };
  const second = { ...createEmptyCostLine("second"), usage: 1, lossRate: null, unitPrice: 3 };
  assert.equal(sumCostLines([]), 0);
  assert.equal(sumCostLines([first]), 22);
  assert.equal(sumCostLines([first, second]), 25);
  const modified = patchCostLine([first, second], "second", { usage: 2, unitPrice: 4 });
  assert.equal(sumCostLines(modified), 30);
  assert.equal(sumCostLines(modified.filter((line) => line.id !== "first")), 8);
});

test("Dirty Guard 对直接返回、提醒、保存、放弃和继续编辑给出正确决策", () => {
  assert.deepEqual(createNavigationIntent(false, "/quote-center"), { navigateTo: "/quote-center", pendingTarget: null });
  assert.deepEqual(createNavigationIntent(true, "/quote-center"), { navigateTo: null, pendingTarget: "/quote-center" });
  assert.deepEqual(resolveDirtyChoice("save", "/quote-center"), { shouldSave: true, navigateTo: "/quote-center" });
  assert.deepEqual(resolveDirtyChoice("discard", "/quote-center"), { shouldSave: false, navigateTo: "/quote-center" });
  assert.deepEqual(resolveDirtyChoice("continue", "/quote-center"), { shouldSave: false, navigateTo: null });
});
