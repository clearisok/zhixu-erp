# 当前状态：修复工具PR126的main前移证据兼容

2026-10-23；main独立核实为`996dfedc12da3527343cd3ff2aa5eea35497e10e`。
root唯一writer，既有独立reviewer只读。复用原`codex/release-document-merge-guard`干净956921f6，
该分支未被其他工作树占用，没有新增工作树、reset/clean/force或GitHub合并。当前只修改发布
工具、合成Git测试和恢复文档，不带入其他业务候选源码、SQL、UI或运行配置。

只读复核发现P2：新main合并点不必是旧side冻结证据的祖先，现有逐记录约束会拒绝合法整合。
不能直接删除约束或换成base→HEAD；仅检查recordedAt恰为merge也能被普通后置checkpoint
绕过。实际Git红测7项0pass/7fail已复现合法整合误拒及后置普通提交漏历史；生产修复尚未开始，不能报告通过。方案保留同路径
显式整合见证，并独立有界检查actualBase→HEAD走廊的真实合并及全部父清单历史。原锚点、
blob/hash、前驱祖先、唯一leaf、mergeOf贡献和截图规则保持。见[工具任务](tasks/active/release-document-merge-guard-2026-10-20.md)。

本分支清单仍213证据/46能力，不把全量候选286/58复制到工具PR。此前完整Goal状态在
[94a1767b逐字快照](tasks/completed/2026-10-23-release-main-advance-inputs/94a1767b/CURRENT_STATE.md)：
来源0c三CI全success；当前0c镜像8/8及本地发布116通过；94精确门禁/远端及Release39816442442
亦success。原推送STOP/exit1和后续零push只读exact分别保留，不推断永久网络修复。
这些结果不冒称本工具新修复测试通过；本次未重跑应用、数据库或浏览器验收。

Full Goal active；PR120–127仍原head开放草稿，不自动merge/close。下一步是red回归、窄修复、
独立复审与精确交付/新CI，再提交具体合并建议。新真实Source固定额度、覆盖v1和原关账问题
仍待回复，不默认；Num/outdate已确认。3001、50426、62426及全部旧入口/卷/账号/Browser/
工作树继续保护，无真实Source/账号/业务库、部署或退役操作。原956和94三摘要均按Git字节归档。
