# 全合同只读审计工程证据
核实2026-10-13；main 8b3f3d811d05182ea1a7f3214eae9d530056fa04；feat/ainuoke-readonly-validation起始clean。此文件经checkpoint冻结后不覆盖；后续结果另立证据。

PR103 head1de3078dfd0bcb540d87f792f0b43273f294a615的baseline/team-access/source三项CI成功，用户授权后于2026-10-13T00:02:33Z合并为上述main。只读API验证merge对象签名、tree及双亲；初始git fetch网络reset，缺失对象精确SHA重建后才创建新worktree，未伪造远端提交或使用旧基线。

实现：Python固定6086103/6087050、有界完整分页、最多80合同均匀样本、前后Discovery；Node复用Discovery adapter及现有物料纯投影，区分空/非法/未知数量/代表合同不足。私密终端输入、匿名stdin、900秒来源worker、90秒离线分析；私有报告独占文件，ignored outputs，标准输出无真实合同号/单据明细。无DB/绑定/调度/监听/UI/SQL/生产路由变更。

本机：
- 新增Node审计8/8 PASS：真实纯投影四流、首合同空不掩盖后续、558均匀80、重复身份/分页/漂移/漏样拒绝、错合同/缺物料页不代表通过、未知数量/缺日期、秘密/过期/预算拒绝、实际离线CLI私有文件与脱敏输出。
- Python66/66 PASS：在原64基础补全两遍558合同/104固定报告请求/80样本/原凭据不输出，以及显式私密audit与非法scope/分页拒绝。
- typecheck/server:build/lint/build PASS。最初flatMap联合事件类型推断失败，显式ReadPurchase|ReadMovement泛型后已通过，无业务算法变化。
- root810/810 PASS；来源20 PASS/1 Windows skip，continuous29 PASS/1 Windows skip。readiness9 PASS/1 Windows skip，基线71/71 PASS；最终实际main守卫见后续final-gate，Linux分支待Ubuntu CI实际执行。
- 单位字段未映射，报告如实not-mapped-not-verified；不跨材料加总。三代表合同仅来源记录存在/技术字段验证，不是人工业务验收或Source激活。
- 真实扩大核对命令已交用户私密执行；本证据不提前断言真实全量结果。上轮首页回执保持原文件不覆盖。

代码与测试：server/ainuoke-source/readonly-audit.ts、server/integration/ainuoke-readonly-audit.test.ts、tools/ainuoke-bridge/ainuoke_bridge/server_source.py及tests、scripts/ainuoke-readonly-audit.ps1；CI已加入新增测试。
