# Gate 1.5 — 隔离艾诺科物料只读 Source Adapter

日期：2026-10-10。ENGINEERING PASS / TRUSTED SERVER CONNECTION NOT IMPLEMENTED。

## Baseline 与文件所有权

- Worktree：`D:\workspace\zhixu-order-material-b`；Branch：`feat/ainuoke-order-material-progress`。
- 本轮起始 HEAD / #92：`661d4cadef61695284b9486d2018731ef420a9ac`，Draft / OPEN。
- fetch 后 main：`84c8c5b520dbcb956ae27a24103e6607a1c227c3`。
- 最新核对 #91：`e58e6def4b5a310880ac1fc6906e4f789e61bad4`，OPEN，64 changed files。#92 完整范围加本轮增量与其交集 `[]`。
- 已知继承 dirty：`docs/tasks/active/order-material-read-gate1.md`，仅上轮用户业务方向补充 30 行；文件 SHA256 `8B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E`。本轮未修改、未 stage、未提交该文件。业务来源方向仍见此文档，不能因此启动关联功能。
- 本轮五个独立文件：`features/ainuoke-material-progress/{source-adapter,read-service,projection}.ts`、`tests/order-material-source-adapter.test.mjs`、本任务文档。未修改共享文档、权限目录、Server 路由、Quote、0010/0011、部署配置或其他工作树。

## 实际实现

`createMaterialSourceLoader()` 实现 Gate 1 `loadSource` 端口。此前只有端口和合成注入，没有这条来源适配链。

1. 要求现有 `order.view` + `style_progress.read`，并重新调用可信 `resolveVisibleOrder` 核对 UUID、版本、BillNo 和可见范围。直接调用 loader 也不能绕过订单范围。
2. 使用 Server 安装的 `readDiscovery` 能力读取完整脱敏 6086103 pages，复用 `adaptAinuokeOrderDiscoverySnapshots()` 的映射、唯一 BillNo、source identity 和分页校验；补充整数和时间校验。仅对其已验证 normalized BillNo 精确查找关联，不按款号匹配，不创建第二个 Matcher。
3. 当前 InsideOrderNo 来自上述 Discovery，而非订单旧查询属性；保持正式 UUID/BillNo。调用的唯一目录 key 为 `material_purchase_statistics`，唯一参数为 `{ insideOrderNo }`。目录固定 6087050，对应既有已证明的 `insideorderno is` 协议；没有新 HTTP client 或猜测 BillNo transport。
4. 校验返回报告、精确 queryContext 与时效；交付 detached snapshots 给唯一 Gate 1 投影。该投影继续复用既有 Material Adapter、Normalize/Dedup/Validate、Canonical、厂供排除和状态算法。物料分页和逐行合同冲突仍由这些已有能力校验。
5. 不缓存、不导出原始响应、不持久化、不做网络调用、不读取凭据、不选择客户端账号、不写 Source、不修改 Browser 数据。

`read-service.ts` 增加固定的空数据结果状态：`source_failed`、`source_missing`、`stale`，复用 `incomplete`、`identity_mismatch`。失败不回显原始错误，均没有物料行。`not_connected` 表示能力未配置/返回 null；空 Snapshot 数组表示来源缺失；完整 total=0 单页则是合法 `ready` 空结果。无效时间为 incomplete，未来时间与超过时效为 stale。

`maxAgeMs` 与 `now` 必须由可信调用方显式提供；没有自行规定生产 SLA。测试的 1000ms 只是确定性测试参数。`server_snapshot` provenance 是未来能力安装契约，不是已证明正式账号/采集/持久化接通。

采购来源单价、金额维持团队共享，并明确 `ainuoke_source` 所有权；未知值保持 null、显式 0 保留。成衣销售价、确认工价、Quote 成本和利润不在 Material DTO。币种不换算，金额不推算，单位未确认继续 null；不跨物料汇总数量，不声明已有精确 Decimal 金额计算。

## 本轮验证

| 检查 | 本轮结果 |
| --- | --- |
| `node --test tests/order-material-source-adapter.test.mjs`（包含在下面聚合运行） | 24/24 PASS |
| Source Adapter + Gate 1 + 原物料投影测试 | 71/71 PASS，0 skipped |
| `npm test` | 750/750 PASS，0 skipped |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS，0 warnings |
| `npm run server:build` | PASS |
| `npm run build` | PASS，42 routes，0 skipped；与 Server build 串行执行 |
| `git diff --check` | PASS |
| 真实账号、Source/API、数据库、Preview、生产安全/运行联调 | NOT RUN；未授权且未接线 |

测试覆盖正常关联、InsideOrderNo 漂移、重复/缺失合同、完整/不完整分页、A/B 并发隔离、权限不足、直接 loader 可见性拒绝、非法客户端选择器、失败/缺失/陈旧/未来时间、合法空页、未知/显式零、厂供、采购/入库/出运去重、采购价格共享、保护价格与凭据不出现在结果/错误、快照不变及投影契约完全一致。

初次测试将 password 混入原本期待 ready 的 fixture，触发既有 Material Source 禁止字段校验；修正为两个独立用例：脱敏有效 Source 保持 ready，未脱敏 Source 必须 incomplete 且无泄露。没有放宽原校验。

## 正式接线仍待批准

- 可信 Server HTTP 路由、正式订单详情摘要、现有款式物料页面 Server 模式与返回订单尚未接线。
- 受控采集账号、可信身份/账号范围、团队订单可见性由未来 Server 实现；当前只有注入能力，不使用旧 Browser/mock Bridge 身份充当证明。
- Discovery/Material Source 的正式采集、完整性留存、刷新策略和生产读取时效待设计及批准；没有 Source 持久 Repository/schema/migration。
- 已记录的共享 CCT 与 Quote 聚合金额读取权限漏洞未修复；本轮仅证明独立 Material 投影的字段边界，不能宣称整个系统已具备生产安全性。
- 本轮不预留 migration，不实施真实账号绑定、真实读取、艾诺科写入、销售价 Excel、财务、独立 UI 或部署。

## Checkpoint 协议

只 stage 上述本轮五个文件并正常 commit/push 原分支，保持唯一 #92 Draft。继承 Gate 1 文档 dirty 原样保留，完整 commit 和远端 receipt 在交付消息及 #92 中记录。共享状态文档继续遵守并行隔离，不修改。等待 #91 合并和用户正式集成 Gate 批准。

## Gate 1.5 定向时钟审查修复（2026-10-10）

Baseline：`578c247cf1b76a4d5a27c3993a5ceb1aaaca3f99`；fetch 后 main 仍为 `84c8c5b520dbcb956ae27a24103e6607a1c227c3`。#91 当前核对 `b7c20802cf13ad9d1e06a8f19f0fca359f81ba21`，64 files；完整 #92 范围及本轮增量交集 `[]`。

先新增两个确定性失败测试：分别在异步 Discovery / Material 读取中推进注入时钟 100ms，并以完成时刻生成 fetchedAt。旧代码两项均 FAIL：实际 stale，预期 ready，确认请求开始时钟误判新 Snapshot。

修复仅将可信时钟采样移至每次 fetchedAt 校验时；Discovery 与 Material 各自使用完成读取后的 validationTime。maxAgeMs 不变，没有容差。真实过期、超出校验时间的未来 Snapshot 仍 stale；无效 fetchedAt 仍 incomplete；非法可信时钟仍 source_failed。

修复后 Adapter29/29，连同 Gate 1/原投影定向测试76/76 PASS（0 skipped）。typecheck、lint（0 warnings）、Server build、diff-check PASS。本轮未重跑 npm 全量、前端 build、浏览器、真实 HTTP/Source/DB；本次仅来源时钟逻辑，不沿用历史 PASS 作为本轮证据。

本轮只提交 source-adapter.ts、独立测试和本报告三个文件。继承 order-material-read-gate1.md 的 30 行补充未修改/未 stage，SHA256 仍为 `8B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E`。不进入正式集成，不修改共享路由、权限、0010/0011、#91、18444、真实账号或数据库。正常 checkpoint/push #92，保持 Draft，完成后停止新增功能。
