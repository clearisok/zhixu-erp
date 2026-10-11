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