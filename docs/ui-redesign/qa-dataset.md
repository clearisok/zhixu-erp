# UI Redesign DEV / QA 仿真业务数据集

## 身份与边界

- Dataset ID：`ui-redesign-qa-v1`
- 固定 seed：`zhixu-ui-redesign-2026`
- 记录标记：`UI-REDESIGN-QA · ui-redesign-qa-v1`
- 用途：为 UI Redesign 的高密度列表、报价、排单和关账验收提供长期 DEV / QA 数据。
- 环境：仅允许在 `127.0.0.1:3001` 或 `localhost:3001` 的 development local-data 环境显式执行。
- 非 Production 数据；不得挂入 `dev`、`build` 或 `start` 生命周期，上线前须按 manifest 单独制定引用安全的清理方案。

生成器通过现有 Service / Repository 写入，不复制 Calculator，不修改 storage namespace、schemaVersion 或业务模型。它采用 `append / ensure / fill missing`：稳定业务 ID 已存在时跳过，不覆盖用户后续修改，也不执行 Reset 或重建。

## 命令与文件

```text
npm.cmd run qa:data:prepare
npm.cmd run qa:data:cleanup
```

`qa:data:prepare` 只生成临时同源执行页 `public/__dev-ui-qa-data.html`；用户必须在合规 DEV Origin 中点击执行。`qa:data:cleanup` 只移除该临时执行页，不删除任何 QA 或用户业务数据。

### 目标 Chrome Profile 装载流程

浏览器本地 Repository 同时按 **Origin** 与 **Browser Profile** 隔离：

- `http://127.0.0.1:3001` 与 `http://localhost:3001` 是两个不同 Origin，二者的 localStorage / IndexedDB 不互通。
- Codex Browser Profile 与用户自己的 Chrome Profile 不共享 localStorage / IndexedDB。
- Loader 无法也不会把数据跨 Profile 推送；它只向“当前打开 Loader 的 Profile + 当前 Origin”写入正式 DEV namespace `zhixu.erp.local.*`。

因此在用户自己的 Chrome 中装载时必须：

1. 启动 `http://127.0.0.1:3001`，并始终使用该 Origin，不要中途切换到 `localhost`。
2. 执行 `npm.cmd run qa:data:prepare`。
3. 使用最终验收 ERP 的同一个 Chrome Profile 打开 `http://127.0.0.1:3001/__dev-ui-qa-data.html`。
4. 核对 Loader 显示的 Origin、Dataset ID、Seed、namespace 和预期数量，然后点击“生成 / 补齐数据集”。
5. 返回同一 Profile、同一 Origin 的 ERP，检查 Quote / Order / Scheduling / Closing。
6. 执行 `npm.cmd run qa:data:cleanup`。该命令只删除临时 Loader，不删除 Dataset。

Loader 成功结果会显示 QA Quote、Order、ScheduleAssignment、Closing Period / Relation 的实际数量和本次 added / skipped 统计。同 datasetId 与 seed 再次执行只跳过已有对象，不覆盖用户已经修改过的 QA Quote / Order。

- 入口脚本：`scripts/generate-ui-qa-data.mjs`
- 数据集实现：`scripts/ui-qa-data/dataset.ts`
- 自动化：`tests/ui-qa-data-simulation.test.mjs`
- 实际 DEV manifest：`artifacts/ui-redesign-qa/manifest.json`

## 实际 Repository 统计

以下数值来自长期 DEV 中安装完成后的正式 Repository 读取，不是生成器预估值。

| Entity | QA Count |
| --- | ---: |
| Customer snapshot identity | 10 |
| Brand snapshot identity | 8 |
| Quote | 72 |
| QuoteRevision | 132 |
| PriceVersion（当前 Revision） | 144 |
| PriceVersion（全部 Revision） | 264 |
| Order | 168 |
| DeliveryPlan | 226 |
| Active DeliveryPlan | 198 |
| QuantityChange | 56 |
| OrderPriceVersion | 210 |
| ProductionGroup | 15 |
| ScheduleAssignment | 150 |
| Closing Month | 3 |
| Closing Relation | 90 |
| OperationLog | 0 |
| Attachment | 0 |

长期 DEV 的总量为 Quote 75、Order 175、ProductionGroup 16、ScheduleAssignment 154、Closing Month 4、Closing Relation 92；因此页面总数不应被误解为只包含 QA 数据。

## 报价覆盖

- 单 Revision Quote 24、V2 Quote 36、V3 Quote 12。
- 单 PriceVersion Quote 24、多 PriceVersion Quote 48。
- 当前 Revision 共 144 个 PriceVersion：中国 72、柬埔寨 72；CNY 72、USD 72。
- 报价状态：`confirmed` 24、`partially_confirmed` 24、`quoting` 12、`draft` 12。
- 客户确认：已确认 24、部分确认 24、未确认 24。
- `defaultRevisionId`、Revision owner、PriceVersion owner 与当前指针均已验证。

## 订单覆盖

- 制作国家：柬埔寨 132、中国 36。
- PO：有 152、无 16。
- 订单状态：取消 3、已确认 130、已完成 15、进行中 15、草稿 5。
- 生产状态：未排单 18、待生产 120、已完成 15、部分完成 15。
- 关账状态：未关账 78、已关账 67、部分关账 23。
- 有数量历史 55、有价格历史 42、有多条 DeliveryPlan 42。
- 每个 QA Order 只包含一个款式；DeliveryPlan 与 ScheduleAssignment 保持为两类独立事实。

## 生产组与队列

柬埔寨 QA Dataset 使用 1–13、15、16 组，共 15 组；未创建 QA 14 组。

| Group | Order Count | Current | Queue | Tail Date |
| --- | ---: | --- | ---: | --- |
| 1组 | 9 | QA-SO-260830-002 | 7 | 2026-09-11 |
| 2组 | 11 | QA-SO-260830-011 | 9 | 2026-09-21 |
| 3组 | 8 | QA-SO-260830-022 | 6 | 2026-09-10 |
| 4组 | 10 | QA-SO-260830-030 | 8 | 2026-09-17 |
| 5组 | 12 | QA-SO-260830-040 | 10 | 2026-09-22 |
| 6组 | 9 | QA-SO-260830-052 | 7 | 2026-09-12 |
| 7组 | 11 | QA-SO-260830-061 | 9 | 2026-09-19 |
| 8组 | 8 | QA-SO-260830-072 | 6 | 2026-09-12 |
| 9组 | 10 | QA-SO-260830-080 | 8 | 2026-09-16 |
| 10组 | 12 | QA-SO-260830-090 | 10 | 2026-09-23 |
| 11组 | 9 | QA-SO-260830-102 | 7 | 2026-09-14 |
| 12组 | 11 | QA-SO-260830-111 | 9 | 2026-09-22 |
| 13组 | 8 | QA-SO-260830-122 | 6 | 2026-09-07 |
| 15组 | 10 | QA-SO-260830-130 | 8 | 2026-09-16 |
| 16组 | 12 | QA-SO-260830-140 | 10 | 2026-09-24 |

各组 sequence 连续，Current / Queue 合法，日期有序；150 个 assignment 均引用真实 Order 和 ProductionGroup，无 orphan。

## 关账覆盖与保护

| Month | Status | Relations | Quantity | Processing Output RMB |
| --- | --- | ---: | ---: | ---: |
| 2026-06 | locked | 15 | 142,980 | 3,103,200.24 |
| 2026-07 | confirmed | 30 | 277,460 | 5,656,047.73 |
| 2026-09 | open | 45 | 447,984 | 10,386,116.23 |

长期 DEV 原有非 QA `2026-08` 关账月及其数据保持不变。生成器发现该月份已占用后选择 `2026-09`，不会删除、修改或覆盖原记录。

## 幂等与完整性

同一 datasetId 与 seed 第二次执行结果：Quote、Order、ScheduleAssignment、Closing Month、Closing Relation 均新增 0；分别跳过 72、168、150、3、90 条。15 个生产组全部复用，未产生重复。自动化还会修改一个既有 QA Order 的 PO 后再次执行，确认用户修改保持不变。

Manifest 保存实际落库 ID。自动化通过正式 Repository 逐一解析 Quote、Order、ProductionGroup、ScheduleAssignment、Closing Month 与 Closing Relation ID，并验证：ID 唯一、无 orphan、Quote→Order 来源合法、default Revision 和 PriceVersion 指针合法、一个订单一个款式、排单 owner 合法、关账 owner 合法。

Generator 未伪造 OperationLog 或 Attachment。若未来需要完整数据删除，必须先实现按引用拓扑验证的独立工具；当前 `qa:data:cleanup` 不是业务数据清理命令。

## 真实浏览器 QA

验收 Origin 为 `http://127.0.0.1:3001`，只进行了导航、搜索、PriceVersion 切换、生产组切换和关账月份切换，没有保存、编辑或删除业务记录。

- 报价中心：页面显示长期 DEV 总量 75；72 条 QA Quote 正常进入列表，精确搜索 `CAM-26001` 返回唯一结果。打开 `uiqa-quote-072` 后，柬埔寨 USD 方案显示面料 ¥102.96、辅料 ¥3.13、原始工价 $2.99 / RMB 折合 ¥23.95、最终报价 ¥142.9；切换中国 CNY 方案后同步显示面料 ¥71.96、辅料 ¥0.99、工价 ¥18.83、最终报价 ¥101.0，成本区、数量、国家和客户确认上下文一致。
- 订单中心：长期 DEV 总量 175，精确搜索 `QA-SO-260830-168` 返回唯一结果；1280 使用核心表格，960 使用 Compact Business Row，402 使用 Mobile Order Card。款号、订单号、客户/PO、数量、交期、订单/生产/关账三类状态和异常均可见。
- 生产排单：总览可见 QA 1–13、15、16 组，不存在 QA 14 组；同时保留一个既有非 QA `一组`。实际点击 1、7、13、15、16 组，分别渲染 9、11、8、10、12 条队列记录，队尾日期分别为 2026-09-11、2026-09-19、2026-09-07、2026-09-16、2026-09-24。
- 关账中心：下拉同时显示 QA `2026-06`（锁定）、`2026-07`（确认）、`2026-09`（开放）和原非 QA `2026-08`（开放）。逐月切换后的数量/加工产值分别为 142,980 / ¥3,103,200.24、277,460 / ¥5,656,047.73、447,984 / ¥10,386,116.23、10,000 / ¥65,000.00。
- Browser Console：无 error；只有 Vite 连接、React DevTools 和 Build Info 信息日志。

## 质量门

| Check | Result |
| --- | --- |
| TypeScript | PASS |
| ESLint | PASS |
| Full Tests | PASS，382/382；QA Dataset 5/5 |
| Production Build | PASS，23 routes |
| Browser Console | PASS，0 error |
| Phase 2.5 source diff check | PASS |

完整 dirty worktree 的原始 `git diff --check` 仍会因 Phase 2.5 前已存在的 `artifacts/artifact-tool-qa/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs` 4 处 trailing whitespace 返回非零；Phase 2.5 tracked diff 与新增文件尾空格检查均通过，本阶段未改动该 vendored artifact。

## 后续 UI 输入（本阶段不实施）

- 订单 Compact / Mobile 在 175 条数据下仍一次渲染完整长列表；搜索可用，但长列表的初始 DOM 规模、返回位置与持续滚动成本需要后续性能专项评估。
- 生产组总览在 15 个 QA 组加既有组时可用，但卡片数量已经形成显著纵向长度；单组入口、当前执行项与异常的扫描效率应成为 Delivery Phase 3 的真实基线。
- 单组排单表在 1280 下包含 11 个高密度字段；队列 8–12 条可用，但操作列、物料/物流和日期信息竞争宽度，需要 Phase 3 按任务优先级处理。
- 组导航 badge 展示的是当前项之后的队列数量，而总览文案也使用“待生产”，与组内总记录数不同；后续设计应明确区分“队列总数 / 当前 / 待生产”，不改变正式排单事实。
- 关账中心在 175 个订单下也形成很长的全量记录区和重复操作，属于后续关账页面阶段的分页、虚拟化或分层查询输入，不在 Phase 2.5 或 Phase 3 提前重构。
