# 当前状态：修复工具PR126的main前移证据兼容

2026-10-23；main独立核实为`996dfedc12da3527343cd3ff2aa5eea35497e10e`。
root唯一writer，既有独立reviewer只读。复用原`codex/release-document-merge-guard`干净956921f6，
该分支未被其他工作树占用，没有新增工作树、reset/clean/force或GitHub合并。当前只修改发布
工具、合成Git测试和恢复文档，不带入其他业务候选源码、SQL、UI或运行配置。

实际Git红测7项0pass/7fail已复现P2：main前移误拒旧side冻结证据，以及后置普通提交漏掉side历史。
窄修复已实现：同路径显式整合见证与actualBase→HEAD真实merge走廊父清单保护分别验证；
最多256个merge、每merge8个parent、父清单累计64MiB，缺失或超限明确拒绝。原锚点、blob/hash、
前驱祖先、唯一leaf、mergeOf贡献和截图规则保持。扩展16项定向、首轮134项通过后，上限检查
顺序再收紧；最终源码checkpoint`cff4addd59f5492b677ae88b502db0d0e5affa72`完整回归134/134
通过（377139.5791ms、0跳过/失败/取消），含单/双侧9及10000-parent零对象读取spy。语法、
定向lint、精确996门禁通过；独立只读复审无剩余P1/P2。同一Git冻结脚本在既有完整候选94
也通过（286证据/58能力/88继承UI路径），该候选保持干净、未升级运行环境。见[工具任务](tasks/active/release-document-merge-guard-2026-10-20.md)。

本分支清单仍213证据/46能力，不把全量候选286/58复制到工具PR。此前完整Goal状态在
[94a1767b逐字快照](tasks/completed/2026-10-23-release-main-advance-inputs/94a1767b/CURRENT_STATE.md)：
来源0c三CI全success；当前0c镜像8/8及本地发布116通过；94精确门禁/远端及Release39816442442
亦success。原推送STOP/exit1和后续零push只读exact分别保留，不推断永久网络修复。
新工具有上述自身回归；不借原应用/镜像/CI证明新代码。此次未重跑应用、数据库或浏览器验收。

Full Goal active；PR120–127仍开放草稿，不自动merge/close。本checkpoint之后仅向原#126
安全交付、独立核实精确HEAD、检查新CI；不预先宣称远端PASS。交付后结果见原PR及精确HEAD
回执，再提交具体合并建议。新真实Source固定额度、覆盖v1和原关账问题
仍待回复，不默认；Num/outdate已确认。3001、50426、62426及全部旧入口/卷/账号/Browser/
工作树继续保护，无真实Source/账号/业务库、部署或退役操作。原956、94和红测93三摘要均按Git字节归档。
