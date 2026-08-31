import assert from "node:assert/strict";
import test from "node:test";

import { createQuoteOperationLogs } from "../features/operation-logs/model/operation-log.ts";
import { groupOperationLogs, operationLogSections } from "../features/operation-logs/model/operation-log-presentation.ts";
import { createOperationLogRepository } from "../features/operation-logs/repository/operation-log-repository.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

const actor = { userId: "user-admin", userName: "系统管理员" };
const now = "2026-08-24T14:59:34.000Z";

function quoteWithRows(id = "grouping") {
  const quote = createQuoteDraft(id, `QT-${id}`, "2026-08-24");
  const revision = getDefaultRevision(quote);
  revision.baseInfo.quoteStyleNo = "D1935";
  revision.baseInfo.styleName = "嵌条连衣裙";
  revision.priceVersions[0].pricingParameters.markupRate = 8;
  revision.priceVersions[0].trims.push({ id: "trim-pack", sourceLibraryItemId: null, name: "包装材料", specification: "常规", supplier: "宁波华美", usage: null, unit: "套", lossRate: 5, unitPrice: 1.2 });
  revision.priceVersions[0].otherCosts.push({ id: "other-freight", name: "运费", specification: "", usage: 1, unit: "件", lossRate: 0, unitPrice: 1, amount: 1, source: "manual" });
  return quote;
}

test("一次 Quote Save 的全部 Event 共用 operationId 并按 sequence 稳定排序", () => {
  const before = quoteWithRows();
  const after = structuredClone(before);
  const revision = getDefaultRevision(after);
  revision.priceVersions[0].trims[0].usage = 1;
  revision.priceVersions[0].trims[0].unitPrice = 1.5;
  revision.priceVersions[0].otherCosts[0].amount = 3;
  revision.priceVersions[0].pricingParameters.markupRate = 10;

  const logs = createQuoteOperationLogs(before, after, actor, now);
  assert.equal(new Set(logs.map((log) => log.operationId)).size, 1);
  assert.deepEqual(logs.map((log) => log.operationSequence), logs.map((_, index) => index));

  const nextSave = createQuoteOperationLogs(after, structuredClone(after), actor, now);
  assert.notEqual(logs[0].operationId, nextSave[0].operationId);
  const [group] = groupOperationLogs([...logs].reverse());
  assert.deepEqual(group.events.map((log) => log.operationSequence), logs.map((_, index) => index));
});

test("同一保存的成本和报价参数 Event 聚合为一个业务操作组", () => {
  const before = quoteWithRows("save-group");
  const after = structuredClone(before);
  const revision = getDefaultRevision(after);
  revision.priceVersions[0].trims[0].unitPrice = 1.5;
  revision.priceVersions[0].otherCosts[0].amount = 3;
  revision.priceVersions[0].pricingParameters.markupRate = 10;

  const groups = groupOperationLogs(createQuoteOperationLogs(before, after, actor, now));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].action, "保存报价");
  assert.match(groups[0].targetLabel, /D1935 · 嵌条连衣裙 · V1/);
  const sections = operationLogSections(groups[0]);
  assert.deepEqual(sections.map((section) => section.category), ["价格版本", "辅料成本", "其他费用"]);
  assert.equal(sections.flatMap((section) => section.items).some((item) => item.log.action === "保存报价"), false);
});

test("业务显示快照不依赖当前 Quote Repository，主对象不会退回 quote-draft ID", () => {
  const before = quoteWithRows("quote-draft-technical-id");
  const after = structuredClone(before);
  getDefaultRevision(after).priceVersions[0].trims[0].supplier = "客供";
  const [group] = groupOperationLogs(createQuoteOperationLogs(before, after, actor, now));
  assert.match(group.targetLabel, /D1935/);
  assert.match(group.targetLabel, /嵌条连衣裙/);
  assert.doesNotMatch(group.targetLabel, /quote-draft/);
  assert.equal(group.events[0].afterData?.quoteStyleNo, "D1935");
  assert.equal(group.events[0].afterData?.styleName, "嵌条连衣裙");
});

test("旧日志无 operationId 时正常读取且每个 Event 单独成组", async () => {
  const before = quoteWithRows("legacy");
  const after = structuredClone(before);
  getDefaultRevision(after).priceVersions[0].trims[0].unitPrice = 1.5;
  const oldLogs = createQuoteOperationLogs(before, after, actor, now).map((log, index) => {
    const legacy = { ...log, id: `legacy-${index}` };
    delete legacy.operationId;
    delete legacy.operationSequence;
    delete legacy.changes;
    return legacy;
  });
  const values = new Map([["zhixu.operation-logs.v1", JSON.stringify(oldLogs)]]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const read = await createOperationLogRepository(storage).list();
  assert.ok(read.every((log) => log.operationId === undefined));
  assert.ok(read.some((log) => log.changes.length > 0));
  assert.equal(groupOperationLogs(read).length, read.length);
});

test("字段差异严格区分 null、2、0 与回到 null", () => {
  const empty = quoteWithRows("nullable");
  const two = structuredClone(empty);
  getDefaultRevision(two).priceVersions[0].trims[0].usage = 2;
  const zero = structuredClone(two);
  getDefaultRevision(zero).priceVersions[0].trims[0].usage = 0;
  const cleared = structuredClone(zero);
  getDefaultRevision(cleared).priceVersions[0].trims[0].usage = null;
  const change = (before, after) => createQuoteOperationLogs(before, after, actor, now).find((log) => log.action === "修改辅料成本")?.changes.find((item) => item.field === "数量/用量");
  assert.deepEqual(change(empty, two), { field: "数量/用量", beforeValue: null, afterValue: 2 });
  assert.deepEqual(change(two, zero), { field: "数量/用量", beforeValue: 2, afterValue: 0 });
  assert.deepEqual(change(zero, cleared), { field: "数量/用量", beforeValue: 0, afterValue: null });
});

test("新增和删除成本行使用业务摘要而不是空值箭头", () => {
  const before = quoteWithRows("row-lifecycle");
  const added = structuredClone(before);
  getDefaultRevision(added).priceVersions[0].trims.push({ id: "trim-thread", sourceLibraryItemId: null, name: "缝线", specification: "40S", supplier: "客供", usage: 1, unit: "卷", lossRate: 3, unitPrice: 0.8 });
  const addedItem = operationLogSections(groupOperationLogs(createQuoteOperationLogs(before, added, actor, now))[0]).flatMap((section) => section.items).find((item) => item.log.entityId === "trim-thread");
  assert.equal(addedItem?.mode, "create");
  assert.equal(addedItem?.title, "新增辅料「缝线」｜V1｜基础价格");

  const removed = structuredClone(added);
  getDefaultRevision(removed).priceVersions[0].trims = getDefaultRevision(removed).priceVersions[0].trims.filter((line) => line.id !== "trim-thread");
  const removedItem = operationLogSections(groupOperationLogs(createQuoteOperationLogs(added, removed, actor, now))[0]).flatMap((section) => section.items).find((item) => item.log.entityId === "trim-thread");
  assert.equal(removedItem?.mode, "delete");
  assert.equal(removedItem?.title, "删除辅料「缝线」｜V1｜基础价格");
});
