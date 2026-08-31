import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createQuoteDeletionLog, createQuoteOperationLogs } from "../features/operation-logs/model/operation-log.ts";
import { createOperationLogRepository } from "../features/operation-logs/repository/operation-log-repository.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

const actor = { userId: "user-quote-operator", userName: "林青禾" };
const now = "2026-08-23T10:30:00.000Z";

function quoteWithCosts(id = "operation-log") {
  const quote = createQuoteDraft(id, `QT-${id}`, "2026-08-23");
  const revision = getDefaultRevision(quote);
  revision.baseInfo.quoteStyleNo = "T2337";
  revision.baseInfo.styleName = "测试款";
  const version = revision.priceVersions[0];
  version.fabrics.push({ id: "fabric-1", sourceLibraryItemId: null, name: "精梳棉40S", composition: "100% Cotton", segmentLengthCm: 120, netWidthCm: 145, gsm: 180, lossRate: 3, supplier: "XX纺织", unitPrice: 23.5, purchaseUnit: "kg" });
  version.trims.push({ id: "trim-1", sourceLibraryItemId: null, name: "吊牌", specification: "常规", supplier: "辅料厂", usage: 1, unit: "个", lossRate: 2, unitPrice: 0.35 });
  version.labor = { value: 10, description: "车缝" };
  version.otherCosts.push({ id: "other-1", name: "包装费", specification: "", usage: 1, unit: "件", lossRate: 0, unitPrice: 0.8, amount: 0.8, source: "manual" });
  return quote;
}

test("面料价格保存差异记录用户、时间、字段与修改前后值", () => {
  const before = quoteWithCosts();
  const after = structuredClone(before);
  getDefaultRevision(after).priceVersions[0].fabrics[0].unitPrice = 24.8;
  const logs = createQuoteOperationLogs(before, after, actor, now);
  const fabricLog = logs.find((log) => log.action === "修改面料成本");
  assert.ok(fabricLog);
  assert.equal(fabricLog.userId, actor.userId);
  assert.equal(fabricLog.userName, actor.userName);
  assert.equal(fabricLog.createdAt, now);
  assert.equal(fabricLog.beforeData?.values?.单价, 23.5);
  assert.equal(fabricLog.afterData?.values?.单价, 24.8);
  assert.deepEqual(fabricLog.changes.find((change) => change.field === "单价"), { field: "单价", beforeValue: 23.5, afterValue: 24.8 });
  assert.equal(fabricLog.beforeData?.rowName, "精梳棉40S");
  assert.ok(logs.some((log) => log.action === "保存报价"));
});

test("辅料、工价和其他费用分别形成独立日志", () => {
  const before = quoteWithCosts("cost-groups");
  const after = structuredClone(before);
  const version = getDefaultRevision(after).priceVersions[0];
  version.trims[0].unitPrice = 0.4;
  version.labor.value = 11;
  version.otherCosts[0].unitPrice = 1;
  version.otherCosts[0].amount = 1;
  const actions = createQuoteOperationLogs(before, after, actor, now).map((log) => log.action).filter((action) => action !== "保存报价");
  assert.deepEqual(actions, ["修改辅料成本", "修改其他费用", "修改报价工价"]);
});

test("字段级日志严格区分空、2 和 0，并记录供应商及成本加成率", () => {
  const before = quoteWithCosts("field-values");
  const beforeRevision = getDefaultRevision(before);
  beforeRevision.priceVersions[0].trims[0].usage = null;
  beforeRevision.priceVersions[0].pricingParameters.markupRate = 8;

  const changed = structuredClone(before);
  const changedRevision = getDefaultRevision(changed);
  changedRevision.priceVersions[0].trims[0].usage = 2;
  changedRevision.priceVersions[0].trims[0].supplier = "新辅料厂";
  changedRevision.priceVersions[0].pricingParameters.markupRate = 10;
  const firstLogs = createQuoteOperationLogs(before, changed, actor, now);
  const trimLog = firstLogs.find((log) => log.action === "修改辅料成本");
  const pricingLog = firstLogs.find((log) => log.action === "修改价格版本" && log.changes.some((change) => change.field === "成本加成率"));
  assert.deepEqual(trimLog?.changes.find((change) => change.field === "数量/用量"), { field: "数量/用量", beforeValue: null, afterValue: 2 });
  assert.deepEqual(trimLog?.changes.find((change) => change.field === "供应商"), { field: "供应商", beforeValue: "辅料厂", afterValue: "新辅料厂" });
  assert.deepEqual(pricingLog?.changes.find((change) => change.field === "成本加成率"), { field: "成本加成率", beforeValue: 8, afterValue: 10 });

  const zeroed = structuredClone(changed);
  getDefaultRevision(zeroed).priceVersions[0].trims[0].usage = 0;
  const zeroLog = createQuoteOperationLogs(changed, zeroed, actor, now).find((log) => log.action === "修改辅料成本");
  assert.deepEqual(zeroLog?.changes.find((change) => change.field === "数量/用量"), { field: "数量/用量", beforeValue: 2, afterValue: 0 });
});

test("价格版本创建、删除和客户确认均追加动作记录", () => {
  const before = quoteWithCosts("price-version");
  const withVersion = structuredClone(before);
  const revision = getDefaultRevision(withVersion);
  const copied = structuredClone(revision.priceVersions[0]);
  copied.id = "price-stripe";
  copied.name = "彩条";
  copied.confirmation = null;
  revision.priceVersions.push(copied);
  assert.ok(createQuoteOperationLogs(before, withVersion, actor, now).some((log) => log.action === "创建价格版本"));

  const confirmed = structuredClone(withVersion);
  getDefaultRevision(confirmed).priceVersions[1].confirmation = { quotedGarmentPrice: 35, confirmedGarmentPrice: 34.5, quotedLaborPrice: 11, confirmedLaborPrice: 10.8, note: "客户确认", confirmedAt: now };
  assert.ok(createQuoteOperationLogs(withVersion, confirmed, actor, now).some((log) => log.action === "确认报价"));

  const removed = structuredClone(confirmed);
  getDefaultRevision(removed).priceVersions.pop();
  assert.ok(createQuoteOperationLogs(confirmed, removed, actor, now).some((log) => log.action === "删除价格版本"));
});

test("附件图片上传、删除和款式图变化均被记录", () => {
  const before = quoteWithCosts("attachment-log");
  const uploaded = structuredClone(before);
  const revision = getDefaultRevision(uploaded);
  revision.imageAttachmentIds = ["image-1"];
  revision.styleImageAttachmentId = "image-1";
  const uploadActions = createQuoteOperationLogs(before, uploaded, actor, now).map((log) => log.action).filter((action) => action !== "保存报价");
  assert.deepEqual(uploadActions, ["上传图片", "设置款式图"]);

  const removed = structuredClone(uploaded);
  getDefaultRevision(removed).imageAttachmentIds = [];
  getDefaultRevision(removed).styleImageAttachmentId = null;
  const removeActions = createQuoteOperationLogs(uploaded, removed, actor, now).map((log) => log.action).filter((action) => action !== "保存报价");
  assert.deepEqual(removeActions, ["删除附件", "设置款式图"]);
});

test("报价创建、报价版本创建与报价删除使用独立实体日志", () => {
  const quote = quoteWithCosts("lifecycle");
  const created = createQuoteOperationLogs(null, quote, actor, now);
  assert.equal(created[0].action, "创建报价");
  assert.equal(created[0].entityType, "Quote");

  const next = structuredClone(quote);
  const source = getDefaultRevision(next);
  const revision = structuredClone(source);
  revision.revisionId = "revision-v2";
  revision.revisionLabel = "V2";
  revision.parentRevisionId = source.revisionId;
  next.revisions.push(revision);
  next.defaultRevisionId = revision.revisionId;
  assert.ok(createQuoteOperationLogs(quote, next, actor, now).some((log) => log.action === "创建报价版本"));

  const deleted = createQuoteDeletionLog(next, actor, now);
  assert.equal(deleted.action, "删除报价");
  assert.equal(deleted.afterData, null);
});

test("OperationLog repository 仅暴露追加和读取，读取结果按时间倒序且隔离引用", async () => {
  const repository = createOperationLogRepository(null);
  assert.equal("update" in repository, false);
  assert.equal("delete" in repository, false);
  const draft = createQuoteOperationLogs(null, quoteWithCosts("repository"), actor, "2026-08-23T09:00:00.000Z")[0];
  const first = await repository.append(draft);
  const secondDraft = { ...draft, action: "更新报价版本", createdAt: "2026-08-23T10:00:00.000Z", afterData: { values: { 版本: "V1" } } };
  await repository.append(secondDraft);
  first.userName = "污染读取结果";
  const logs = await repository.listByQuoteId("repository");
  assert.deepEqual(logs.map((log) => log.createdAt), ["2026-08-23T10:00:00.000Z", "2026-08-23T09:00:00.000Z"]);
  assert.equal(logs[1].userName, "林青禾");
  assert.equal((await repository.list()).length, 2);
});

test("Quote Editor 在保存成功后统一追加日志并提供只读时间线入口", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../features/operation-logs/components/operation-log-modal.tsx", import.meta.url), "utf8");
  const quoteModel = await readFile(new URL("../features/quote-center/model/quote-view-model.ts", import.meta.url), "utf8");
  assert.match(editor, /await mockQuoteRepository\.save\(targetQuote\);\s+await appendSavedOperationLogs\(targetQuote, additionalLogs\)/);
  assert.match(editor, /await mockQuoteRepository\.save\(next\);\s+await appendSavedOperationLogs\(next\)/);
  assert.match(editor, /const operationId = createOperationId\(\)/);
  assert.match(editor, /assignOperationMetadata/);
  assert.match(editor, /label: "操作记录"/);
  assert.match(panel, /OperationLogGroupList/);
  assert.doesNotMatch(panel, /删除日志|编辑日志/);
  assert.doesNotMatch(quoteModel, /OperationLog|operationLogs/);
});
