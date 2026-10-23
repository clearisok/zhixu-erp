# 恢复点：PR 实际检出基线解析器

2026-10-23，root唯一writer，既有reviewer只读。先读CURRENT_STATE、[任务](tasks/active/release-pr-base-context-2026-10-23.md)、AGENTS和实际git状态。当前 `codex/release-pr-base-context` 从main `e06162c70c9792895c30030216dc8c2a66368069` 干净建立，前一原PR120 e872已精确送达，原分支保留；不混入业务修复。

真实失败：Release39889936426 checkout993=[e061,e872]，payload base=996，guard按旧值报错。只修release workflow的比较参数和新增本地Git只读解析器/19项测试；main guard/134回归不变。验证 HEAD==CHECKOUT_SHA、PR merge ref和编号、恰好双父、第二父==PR head、父对象完整，取第一父；PR上下文异常拒绝，无default回退。workflow_dispatch保留原行为。无fetch/API/认证或权限扩展。

源码checkpoint=9b1d0560a284b36635c17d5557e92e71f0c21d03、验收checkpoint=628f5951a853d490ad33edceab360efe36e427ad。首轮117项/102通过15失败的完整基线文档错误保留；补齐后完整发布134/134（406863.4288ms）、解析器19/19（7594.8956ms）、显式e061门禁、语法/lint/YAML均通过。所有测试handle终态，不重复poll或重跑。213证据/46能力原样、六份输入Git字节核实，独立静态复审无P1/P2。

下一步最终文档提交/精确门禁/结果复审，然后一次精确交付唯一草稿工具PR、新CI；原PR120再前向整合相同原始修复提交并复验CI。ignored诊断driver先核实helper e2身份，再dynamic import；有界Git预检/显式pipe/固定错误，按targetSHA独占回执、只提取push固定布尔特征，原tool控制/分类不变。未执行前不得称已诊断本次push。原120的First team和Source均success；Release真实失败保留。不自动合并。

站立安全Git恢复授权有效，不再逐SHA询问。先前push exit1/STOP而API exact的冲突原文保留，不重复推送、不据此宣称网络永久修复。所有旧运行入口和数据保护；本轮无真实Source或业务库、账号、部署/切换/退役操作。完整Goal与待决业务边界不变。双方前摘要已[逐字归档](tasks/completed/2026-10-23-pr-base-context-inputs/)。
