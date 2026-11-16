# 压缩目录审计基线修复（2026-11-16）

用户继续原交付目标；不新增业务功能、不部署production。基线main/staging b3047410ac292c48f0850e841241c00658dc0d75，工作树切换前干净；本分支fix/sync-audit-packed-catalog-baseline从该完整基线开始。上轮真实发布记录在本机chore/sync-audit-staging-release-20261113的9588ddb7，不能覆盖或误作产品增量。

## 实际恢复与新证据

PR146已合并、三项CI/复审通过，0058和4审计表于11/13正常部署；发布后配对备份20261113T084623Z-b1ddd733于08:59:36Z完成。上轮中断在启用前，因此到11/16仍DISABLED，不能冒称期间自动同步。恢复核实620原订单/620head/28237快照、0缺/0重复，23人工表/3账号未变，本机owner0。正常监督activate，分钟cron在11/16 11:40:02Z自然启动唯一宁波owner。

首自然目录批次298e8dc7-f447-4573-8aab-4f6d90b7e9aa，11:40:04.459Z至11:40:09.543Z，26报表+1登录、626双遍1252行，提交确认11:40:09.478Z；旧暂停由正常resume解除。接纳6新订单到626，后续批次跨单复用登录0。没有SQL清暂停、手动加速或额外ERP诊断请求。

真实台账发现首次inserted=626错误。只读正式原始证据解包对比：旧run f7923b7e-2755-4bf6-9ba0-c268c87fafd5（2026-11-11T07:52:21.204Z，621条），新run ed35c9dc-9cca-4652-a1fd-0638678dd433（626条），稳定明细身份结果inserted5/updated11/unchanged610。来源逻辑增5与新建织序订单6不相同：旧目录已包含一张当时未建单合同。证据保存在宁波原任务目录catalog-baseline-proof.json；未请求艾诺科、未伪造历史故障hsid旧新值。

## 最小修复

旧fallback把packed-directory元数据直接送auditPages，未解包chunks导致空基线。现复用loadCatalogEvidence的源键/账号/内容哈希核验解包，统一catalogAuditRecordSet；不可核验时计数null和comparison_baseline_unavailable，不把所有旧记录假报新增，不降低本次业务身份/完整性校验。

新增内部reconcileInitialCatalogAudit维护能力，只允许单一首catalog成功审计批次且原计数为全新增，权限必须来自当前DB的audit_log.view及user_permissions.manage。默认真正READ ONLY预览，执行必须精确reviewHash；从同账号不可变前后正式run重算。只改三项审计计数，原计数/更正值/依据run/reviewHash/更正时间存baselineCorrection，另追加既有操作日志。禁止改变业务表、读取指针、任务、成功状态、原读取/提交时间；重复执行无副作用，无新普通用户编辑接口。没有新schema/迁移或UI改版。

回归以原c513真实历史发布器生成packed旧目录，现写入器首次准确计数1新增/1更新/2不变；模拟旧错误后预览0写、错误hash/身份拒绝、更正原证据保留、重放幂等以及7业务/证据表不变。16项相关回归通过，其他最终检查与CI待收口。此修复须正常PR/检查/合并后部署同版本API与worker，不在真实环境直接拼SQL修改审计结果。

## 后续验收

现M的真实队列继续安全运行；审计缺陷不改真实业务。至少第二个自然30分钟目录周期仍需观察。公网验收初次脚本误用anchor菜单选择器和把厂供独立表头也算进自购表头，失败记录保留，修正只限scratch验收脚本，不改已验收UI。新修订合并后按现有runbook受控单owner切换并正常配对备份，执行计数更正先预览再按精确hash应用，之后核对HTTP/Excel/真实页面及持续调度结果。完成前不宣布全量交付。

最终相关回归25/25通过，根类型、Lint和server:build均通过。源码清单只更新本次已核实main锚点与复核时间；不改变历史证据、截图、能力或环境声明。既有182负向基线套件代码未变化，复用前轮已通过记录，远端必要baseline仍须通过。
