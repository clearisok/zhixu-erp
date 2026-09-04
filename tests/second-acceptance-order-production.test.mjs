import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Ainuoke 正式订单详情只投影一次身份事实并隐藏大型数量交期模块", () => {
  const source = readFileSync(new URL("../features/order-center/components/order-pages.tsx", import.meta.url), "utf8");
  const detail = source.slice(source.indexOf("const ainuokeBound"), source.indexOf("type OrderCreateDraft"));
  const overview = detail.slice(detail.indexOf('id="order-overview"'), detail.indexOf('id="order-business"'));
  assert.doesNotMatch(overview, /客户 \/ PO|款式 \/ 订单/);
  for (const label of ["有效数量", "合同交期", "生产状态", "下一步"]) assert.match(overview, new RegExp(label));
  assert.match(detail, /!ainuokeBound && <details className="oc-secondary-history"/);
  assert.match(detail, /维护数量与交期（手工 \/ 历史订单）/);
  assert.match(detail, /order\.deliveryPlans/);
  assert.match(detail, /order\.quantityChanges/);
});

test("生产组首层仅保留待产指标且不再渲染大警告和执行摘要", () => {
  const source = readFileSync(new URL("../features/production-scheduling/components/production-scheduling-page.tsx", import.meta.url), "utf8");
  const groups = source.slice(source.indexOf('aria-label="生产组总览"'), source.indexOf('className="ps-queue-table-wrap"'));
  assert.match(groups, /ps-group-pending/);
  assert.doesNotMatch(groups, /<dt>总计<\/dt>|<dt>当前<\/dt>|<dt>完成<\/dt>|组内执行摘要|<AlertBanner/);
  assert.match(source, /ps-row-exception/);
  assert.match(source, /ps-row-logistics-warning/);
});

test("生产组选择器依附 AppShell 主滚动并且列表不建立横纵嵌套滚动", () => {
  const css = readFileSync(new URL("../app/production-scheduling/production-scheduling.css", import.meta.url), "utf8");
  assert.match(css, /\.ps-scheduling-master-detail > aside \{[^}]*position:\s*sticky;[^}]*top:\s*80px;[^}]*align-self:\s*start/s);
  assert.match(css, /\.ps-group-master \{[^}]*position:\s*static;[^}]*max-height:\s*none;[^}]*overflow:\s*visible/s);
  assert.match(css, /\.ps-group-queue \.ps-queue-table-wrap \{[^}]*overflow:\s*visible/s);
  assert.match(css, /\.ps-unscheduled-pool \{[^}]*overflow:\s*visible/s);
  assert.match(css, /\.ps-pool-row \{[^}]*min-width:\s*0/s);
});

test("关账分组明细使用 fit-first 行宽而不是固定横向滚动", () => {
  const css = readFileSync(new URL("../app/closing-center/closing-center.css", import.meta.url), "utf8");
  assert.match(css, /\.cc-order-row \{[^}]*min-width:\s*0/s);
  assert.doesNotMatch(css, /\.cc-order-row \{[^}]*min-width:\s*1070px/s);
});
