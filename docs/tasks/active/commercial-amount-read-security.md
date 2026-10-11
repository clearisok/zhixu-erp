# 商业金额读取安全修复 — 2026-10-11

## Gate0 baseline 与复现

用户授权独立 Server 安全任务，不合并 PR92、不修改 B 工作树或其认可 UI。原 A 工作树 D:/workspace/zhixu-quote-two-step 的 feat/quote-two-step-creation / HEAD19043f8457c458d60568e479d8238fb1d520bc58 干净，仅落后远端一个提交，无分歧；保留原分支，正常 switch 新分支 fix/commercial-amount-read-security，基线为最新 origin/main fcf36e5eab6c78254f808c1cba38f3a63a66d4f8。

PR91 MERGED，head cf57074185412e323e2f3308bddc2fd3f73be063；PR92 OPEN/Draft，最新 head03b1078e99ff44ceb875dd0b01a1e22358f4dab6。用户本轮明确确认 PR92 订单 UI 于2026-10-11人工验收 PASS；这是用户确认，未重新访问业务环境。PR92 的成本审计只通过 git show 参考，没有合并或改动其文件。

实际 app/service/response/Session/RBAC、Quote Editor/客户端/导出/日志和 D-084/D-087 已审查。现有 projectQuoteResponse 只按 estimate.view 省略 Estimate；缺 quote.cost.view 仍读所有 Revision/PV 成本。两个 CCT GET 只检查 order.view / quote.view。CCT 当前值独立 identity、共享 context、精确 decimal strings/null/zero、版本CAS、可信事务审计不应因安全投影改变。

首次执行 `npx tsx --test --test-concurrency=1 server/integration/commercial-amount-exposure-audit.integration.test.ts`：4/4、0 skipped，实际合成 session HTTP 复现：

| 实际路径 | 已证实问题 | 本轮边界 |
| --- | --- | --- |
| GET /api/v1/quotes/:id | quote.view-only 读取内部工价98765及历史成本 | 依现有 quote.cost.view 修复响应，安全保存缺失保护切片 |
| GET /api/v1/sales-orders/:id/confirmed-commercial-terms | order.view 读销售价12345/工价67890 | 新独立权限政策待批准，SECURITY PENDING |
| GET /api/v1/quotes/:id/revisions/:rid/price-versions/:pid/confirmed-commercial-terms | quote.view 读同一共享金额 | 同上，保留共享事实与原写入契约 |

只有随机 PostgreSQL16/tmpfs/动态 loopback 和合成用户/数据；finally 清理。未读取真实配置、凭据、COS/业务库，不触及18443/18444。
## Gate1 — 既有 Quote 成本权限修复

Quote aggregate 的集中响应使用 allowlist 型 `CostRestrictedQuote`：所有 Revision/PV 仅保留身份、业务基础资料、数量、版本/附件引用及定性确认摘要；完整成本行、工价、费用、制作参数、历史确认金额、派生/未知字段均不返回。顶层 `costVisibility: restricted` / `estimateVisibility: restricted` 明确区分无授权与业务 null/0。有 quote.cost.view 才保持完整 Quote 成本；Estimate 数值还需 estimate.view，不能单靠 Estimate 权限读取内部成本。

普通受限 PUT 使用 metadata-only 契约。Server 先检查可信 quote.edit 与 expectedVersion，然后按当前 DB aggregate 恢复隐藏成本/参数/历史确认/Estimate；normalize/validate、细粒度变更授权、immutable history、repository CAS 与同事务可信审计保持。未知字段、被隐藏成本注入（包括 null/[]）、权限标记、行删除/重排拒绝；缺失字段不作为清空命令。成本编辑权限不隐含成本读取权限。

原完整 Editor 不接收残缺成本 DTO；受限身份只挂载复用 Foundation 的基础资料消费者，支持款号/款名/备注的合法保存，不加载成本计算器/Estimate 或业务缓存。保留原完整授权 Editor 外观；没有改 PR92/UI/CSS。正式加载缓存按 UUID+可信用户+权限集合核对，切换身份/撤权不渲染旧完整记录。服务和客户端均 no-store。

现有列表/客户 Excel/ZIP/内部汇总的权限保持；新增负向 HTTP 覆盖其成本绕过。Quote/Estimate 日志响应对无成本权限者裁剪保护字段，Estimate 事件在 count/paging 前排除；历史审计在 DB 中原样保留。CCT 专用读写/日志政策没有借用 quote.cost.view 重新定义，仍 SECURITY PENDING。

定向统一执行：**42/42，0 skipped**（Quote cost/保存/导出/日志/CAS、实际暴露审计、原 Quote API/日志回归、两组客户端投影，以及独立 CCT 投影3项）。纯核心安全与相关回归39项；CCT3项仅针对未接入端点的投影。首次旧回归失败暴露了完整 fixture 未授既有成本读权限，以及创建-only 旧断言错误预期完整成本；已分别改为有权 full actor 和 restricted/DB-only 保存验证，不给真实角色或普通查看者增加权限。保留原权限否定、历史/CAS/回滚断言。

无 schema/migration/权限目录/默认角色变化，0010/0011未修改；无真实环境操作。Gate3继续执行完整质量及相关 PostgreSQL 回归。