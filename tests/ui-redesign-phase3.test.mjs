import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 3 订单详情使用 Cockpit、分区导航与共享 Workspace", async () => {
  const source = await read("features/order-center/components/order-pages.tsx");
  for (const marker of ["ORDER COCKPIT", "oc-cockpit-card", "<Workspace", "<SectionNavigation", "<SaveBar", "order-production", "order-material", "order-price", "order-attachments", "order-history"]) {
    assert.match(source, new RegExp(marker.replace(/[<]/g, "\\<")));
  }
  assert.match(source, /productionLabels\[scheduleProjection\.productionStatus\]/);
  assert.match(source, /closingLabels\[closingProjection\.status\]/);
  assert.match(source, /formalExceptions/);
});

test("Phase 3 数量与价格历史保持只读并进入 Drawer", async () => {
  const source = await read("features/order-center/components/order-pages.tsx");
  assert.match(source, /historyDrawer/);
  assert.match(source, /title=\{historyDrawer === "quantity" \? "数量历史" : "价格历史"\}/);
  assert.match(source, /log\?\.operationId \?\? change\.id/);
  assert.match(source, /log\?\.operationId \?\? price\.id/);
  assert.match(source, /数量历史追加保存/);
  assert.match(source, /创建新的只读价格版本/);
});

test("Phase 3 排单使用生产组 MasterDetail 并明确数量语义", async () => {
  const source = await read("features/production-scheduling/components/production-scheduling-page.tsx");
  assert.match(source, /<MasterDetail/);
  for (const label of ["总计", "当前", "待产", "完成", "队尾日期", "正式异常"]) assert.match(source, new RegExp(label));
  assert.match(source, /无 QA 14 组/);
  assert.match(source, /Number\(left\[1\]\) - Number\(right\[1\]\)/);
});

test("Phase 3 队列压缩为业务组合列并提供移动卡语义", async () => {
  const source = await read("features/production-scheduling/components/production-scheduling-page.tsx");
  for (const label of ["款号 / 订单", "生产窗口", "队列状态", "异常 / 物流", "data-queue-phase", "data-label"]) assert.match(source, new RegExp(label));
  assert.match(source, /queuePhase === "当前"/);
  assert.match(source, /queuePhase === "已完成"/);
  assert.match(source, /结束生产/);
  assert.match(source, /variant="danger"[\s\S]*?permission="schedule\.complete"/);
});

test("Phase 3 页面不建立第二个主纵向滚动容器", async () => {
  const [orderCss, scheduleCss] = await Promise.all([
    read("app/order-center/order-center.css"),
    read("app/production-scheduling/production-scheduling.css"),
  ]);
  assert.match(orderCss, /Delivery Phase 3: order cockpit/);
  assert.match(scheduleCss, /ps-group-queue \.ps-queue-table-wrap[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden/s);
  assert.match(scheduleCss, /ps-group-queue \.ps-queue-table[^}]*min-width:\s*860px/);
});
