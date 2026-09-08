import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { finalQuoteNumberText, formatFinalGarmentPrice, formatFinalQuoteLabel } from "../features/quote-center/model/final-quote-format.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";
import {
  applyManufacturingPresetToPriceVersion,
  defaultManufacturingPresets,
  normalizeGlobalQuoteSettings,
} from "../features/quote-center/model/quote-settings.ts";
import { createQuoteOperationLogs } from "../features/operation-logs/model/operation-log.ts";
import { groupOperationLogs, operationLogSections } from "../features/operation-logs/model/operation-log-presentation.ts";
import { renamedAttachmentFileName } from "../features/quote-center/model/quote-attachments.ts";

const actor = { userId: "user-1", userName: "林青禾" };

test("最终报价统一保留一位小数并直接截断", () => {
  assert.equal(finalQuoteNumberText(41.25), "41.2");
  assert.equal(finalQuoteNumberText(41.29), "41.2");
  assert.equal(finalQuoteNumberText(40.19), "40.1");
  assert.equal(finalQuoteNumberText(40.10), "40.1");
  assert.equal(formatFinalQuoteLabel(41.25), "FOB RMB 41.2");
  assert.equal(formatFinalGarmentPrice(41.29), "¥41.2");
});

test("中国与柬埔寨制作预设只应用到目标 PriceVersion", () => {
  const revision = getDefaultRevision(createQuoteDraft("quote-preset", "QT-PRESET", "2026-08-25"));
  const manualCost = { id: "manual-cost", name: "测试费", specification: "", usage: 1, unit: "件", lossRate: 0, unitPrice: 1, amount: 1, source: "manual" };
  revision.priceVersions[0].otherCosts = [manualCost];
  const cambodia = applyManufacturingPresetToPriceVersion(revision.priceVersions[0], defaultManufacturingPresets[1]);
  assert.equal(cambodia.pricingParameters.manufacturingCountry, "柬埔寨");
  assert.equal(cambodia.pricingParameters.laborCurrency, "USD");
  assert.equal(cambodia.pricingParameters.markupRate, 5);
  assert.deepEqual(cambodia.otherCosts.map((line) => line.name), ["测试费", "运费"]);
  assert.equal(cambodia.otherCosts[1].amount, null);

  const china = applyManufacturingPresetToPriceVersion(cambodia, defaultManufacturingPresets[0]);
  assert.equal(china.pricingParameters.manufacturingCountry, "中国");
  assert.equal(china.pricingParameters.laborCurrency, "CNY");
  assert.equal(china.pricingParameters.markupRate, 13);
  assert.deepEqual(china.otherCosts.map((line) => line.name), ["测试费"]);
});

test("旧报价设置迁移不会被新增的中国默认预设覆盖", () => {
  const migrated = normalizeGlobalQuoteSettings({ defaultUsdCnyRate: 7.2, defaultLaborCurrency: "USD", defaultMarkupRate: 9 });
  assert.equal(migrated.defaultManufacturingPresetId, null);
  assert.equal(migrated.defaultLaborCurrency, "USD");
  assert.equal(migrated.defaultMarkupRate, 9);
  assert.equal(migrated.manufacturingPresets.length >= 2, true);
});

test("报价成本日志带 Quote、Revision、PriceVersion 和行项目上下文", () => {
  const before = createQuoteDraft("quote-log-context", "QT-CONTEXT", "2026-08-25");
  const after = structuredClone(before);
  const revision = getDefaultRevision(after);
  revision.baseInfo.quoteStyleNo = "1059C";
  revision.baseInfo.styleName = "连衣裙";
  revision.priceVersions[0].trims.push({ id: "trim-thread", sourceLibraryItemId: null, name: "缝线", specification: "40S", supplier: "客供", usage: 1, unit: "卷", lossRate: 3, unitPrice: 0.8 });
  const logs = createQuoteOperationLogs(before, after, actor, "2026-08-25T10:00:00.000Z", "operation-context");
  const event = logs.find((log) => log.entityId === "trim-thread");
  assert.equal(event?.afterData?.quoteCode, "QT-CONTEXT");
  assert.equal(event?.afterData?.revisionId, revision.revisionId);
  assert.equal(event?.afterData?.priceVersionId, revision.priceVersions[0].id);
  assert.equal(event?.afterData?.objectSource, "quote");
  assert.equal(event?.afterData?.objectName, "缝线");
  const group = groupOperationLogs(logs)[0];
  assert.match(group.targetLabel, /Quote 1059C/);
  const item = operationLogSections(group).flatMap((section) => section.items).find((entry) => entry.log.entityId === "trim-thread");
  assert.equal(item?.title, "新增辅料「缝线」｜V1｜基础价格");
});

test("图片重命名保留原扩展名并过滤非法文件名字符", () => {
  assert.equal(renamedAttachmentFileName("正面图.png", "客户确认正面"), "客户确认正面.png");
  assert.equal(renamedAttachmentFileName("正面图.png", "客户/正面.jpg"), "客户-正面.png");
  assert.throws(() => renamedAttachmentFileName("正面图.png", "  "), /不能为空/);
});

test("长表单滚动、附件重命名与顶部价格轨道均已接入真实组件", async () => {
  const [basicPages, quickCreate, attachmentPanel, attachmentRepository, editor, styles] = await Promise.all([
    readFile(new URL("../features/basic-settings/components/basic-settings-pages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/basic-settings/components/quick-master-data-create.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/quote-center/components/attachment-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/quote-center/repository/indexeddb-attachment-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/quote-center/responsive.css", import.meta.url), "utf8"),
  ]);
  assert.match(basicPages, /qc-master-data-long-form-modal/);
  assert.match(quickCreate, /qc-master-data-long-form-modal/);
  assert.match(styles, /qc-master-data-long-form-modal > \.qc-modal-body[^}]*overflow-y:\s*auto/);
  assert.match(attachmentPanel, />编辑名称</);
  assert.match(attachmentRepository, /async rename\(id, name\)/);
  assert.match(editor, /<QuoteCockpit version=\{activeVersion\}/);
  assert.match(editor, /qc-sticky-state/);
});
