# 恢复点：原PR126的main前移证据回归

2026-10-23；main`996dfedc12da3527343cd3ff2aa5eea35497e10e`。root唯一writer，reviewer只读。
当前原`codex/release-document-merge-guard`，从干净956921f63ba3069c059ca64c2324edbc33afefd8
继续，原branch不在其他worktree占用。红测checkpoint93f7e43f15595c9030eef892af708222cfaa5f33
已保存，后续仅本工具/测试/feature/verifiedAt元数据、逐字摘要归档及当前状态更新。
不能混入应用、SQL、UI或其他候选。

先读CURRENT_STATE、原release-document-merge-guard任务及feature，实际check脚本与合成
Git测试。新red已完成7项0pass/7fail（66868.6335ms，预期反例），日志outputs/release-main-advance-20261023/red.log；
两类合法整合误拒绝，后置普通checkpoint删除side历史却返回[]。窄修复及静态独立复审已完成；
扩展16项定向通过；首轮完整134/134、376912.5766ms、0跳过/失败/取消，见release-full.log。
handle69204/80816/3257均终态，不再poll。首轮guard-working PASS检查的是dirty树/HEAD93，
不是最终提交证据。首轮后将8-parent上限提前到对象/祖先读取前，双路径9/10000-parent
spy已补；须对最终源码重新运行完整suite、精确main提交门禁，再交付原PR126/检查新CI。
实现有界同路径H见证+actualBase→HEAD真实merge走廊父清单逐对象保留；256merge/8parent/
64MiB、缺对象/清单/超限fail closed。保持原mergeOf/锚点/blob/截图规则，不删除祖先约束。

只读扫描完整候选94：9 corridor merges/17 distinct parent manifests/6045487 bytes/
max2parents/286证据/errors[]，仅预检数据，不等同新guard在94上PASS。待本地测试终态、
树干净后可冻结脚本到ignored输出、切到既有chore/server-current-image-0042精确94运行
显式996门禁，再安全切回本分支；禁止测试读取工作树时切换分支。

原完整候选/Goal状态在归档94a1767b三摘要，原956摘要同目录另一子目录。94工具文档
已精确guard/远端；Release39816442442 success、attempt1/head94，watch11552已终态，不再poll。
Source0c三原CI39810661082/39810668692/39810675561也success，watch38441已终态。
新image8/8与发布116是原切片事实，不借作本修复PASS。所有ignored回执保留。

Full Goal active；standing安全Git恢复授权有效，不再逐SHA询问。无自动merge/close、正式
部署/入口切换、真实账号/业务库、退役或新Source额度授权。新固定真实恢复问题尚未回复；
若明确批准，须从干净树切到stable feat/garment-filter-recovery精确0c再执行一次，不能在
本dirty工具分支误消耗0HTTP许可。覆盖v1/原关账三问不默认，Num/outdate已确认。
