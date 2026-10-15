# 当前恢复点：PR109原请求重试修复

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5通过GitHub commit API核实；feat/order-identity-and-contract-claim从1fcc440f00eeab962eb766161eab96ed5f67c6b4/clean开始。本轮只改准备弹窗重开时原请求保护及其测试/文档；旧摘要完整归档tasks/completed/2026-10-15-pr109-before-preparation-retry.md。

新增Chromium回归先在原产品源码确定失败：POST实际提交后丢回执，关闭重开数量变空。最小修复保留uncertain/requestId/原表单，busy禁另建。后测6/6，两个POST payload完全相同，PG仅增一准备、SO数不变；typecheck/增量lint/Server显式snapshot构建/root817通过。基线71/71和精确main守卫PASS（10页/16能力/7条继承UI路径）。源代码内容hash、构建元数据与限制见tasks/active/evidence/order-identity/pr109-preparation-retry-2026-10-15.md。

旧1fcc三CI成功：38664130099/38664129942/38664129923；不是新修复CI。两次PR详情connector Transport closed，不能报最新mergeable。Git仍NETWORK_DEGRADED，禁止自动恢复推送或文件API伪造提交；保持唯一PR109，不自动合并部署。最终提交和工作树状态用git核实，只提供当前准确安全交付命令。

Source树48b63101及原安全交付命令保持有效，不改其HEAD/dirty，不读凭据或上游。两合同固定查询尚需新的明确许可，旧次数耗尽；样本币种/单位确认仅精确两行，不扩大全表。旧四单窗口不重启，无真实DB或账号操作。

G2/G3/G4/G5和报价logout修复的原工作树、refs、历史报告全保留，未自动吸收本修复。后续按依赖顺序前向整合，复核同路径冲突，不能声称累计分支都已修复。G1共享CCT仍须G2替换；整页刷新后的准备请求恢复不在本次组件内修复范围。
