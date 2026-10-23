# 恢复点：PR 实际检出基线解析器

2026-10-23，root唯一writer，既有reviewer只读。先读CURRENT_STATE、[任务](tasks/active/release-pr-base-context-2026-10-23.md)、AGENTS和实际git状态。当前 `codex/release-pr-base-context` 从main `e06162c70c9792895c30030216dc8c2a66368069` 干净建立，前一原PR120 e872已精确送达，原分支保留；不混入业务修复。

真实失败：Release39889936426 checkout993=[e061,e872]，payload base=996，guard按旧值报错。只修release workflow的比较参数和新增本地Git只读解析器/19项测试；main guard/134回归不变。验证 HEAD==CHECKOUT_SHA、PR merge ref和编号、恰好双父、第二父==PR head、父对象完整，取第一父；PR上下文异常拒绝，无default回退。workflow_dispatch保留原行为。无fetch/API/认证或权限扩展。

源码checkpoint=9b1d0560a284b36635c17d5557e92e71f0c21d03。19项新解析器已通过；首轮发布实际117项/102通过15失败，全部为AI_HANDOFF缺完整基线，原日志保留、handle80140终态。该文档已补齐；新源码增加GIT_NO_LAZY_FETCH=1，禁止缺对象远端补取。下一步重跑完整发布/精确e061门禁、解析器及语法/lint，再独立复审、精确交付唯一草稿工具PR/新CI，前向整合相同修复提交到原120。不自动合并。原120的First team和Source CI均已success；Release真实失败保留，不冒称三绿。

站立安全Git恢复授权有效，不再逐SHA询问。先前push exit1/STOP而API exact的冲突原文保留，不重复推送、不据此宣称网络永久修复。所有旧运行入口和数据保护；本轮无真实Source或业务库、账号、部署/切换/退役操作。完整Goal与待决业务边界不变。双方前摘要已[逐字归档](tasks/completed/2026-10-23-pr-base-context-inputs/)。
