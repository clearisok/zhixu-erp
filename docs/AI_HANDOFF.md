# 恢复点：Server 收敛 Gate 2

main `996dfedc12da3527343cd3ff2aa5eea35497e10e`；分支 `codex/server-pr-integration`；初始 clean，先 FF 到已核实 #125/add2d690，再执行 #120/57daca3d 的本地保留历史合并。当前所有增量均属于 Gate 2；没有用户 dirty。唯一实现 owner 维护共享文档和清单，reviewer 只读。

当前恢复：#120 合并 eb3a2833、门禁修复 a12825ef、#123 合并 `7eb63602cdb51c043414deabe4d3afed59a1e72d`、第二节点冻结 `de73e611083d8cdc42b4447fa7ce67d93fd94095`。220证据完整；920项目（含116基线）、434后端/集成、52浏览器、112客户端、类型/Node/lint、两种构建、精确996门禁通过，独立复审无新阻塞。Gate2本地工程PASS，远端组合CI未执行。状态收口后，从main996单独提取门禁三文件交付最小工具PR；当前整合分支只作验证引用，不新建重复累计业务PR。原120–125本阶段不合并/改头。仅允许点名三个验收workflow，不触发生产部署workflow。详见Gate2记录。

Gate1已交付唯一草稿 #125，独立API证明完整SHA add2d690a9c3afe6ec1a2633551eaef7dee72ce1，三项 Hosted CI 通过；工具错误状态被保留，未重推。本次一次上传授权已执行，勿重复推送该提交。持久空目标 https://localhost:62426 使用镜像8175f628与固定ops d084a586，62业务表0行，1技术管理员，29schema。当前源码继续开发不会改变该目标。证书未安装系统信任。

保留3001/50426/59069及所有旧样本，Gate2只用合成副本与一次性库组合验收；不自动合并、部署、改真实账号/业务库或新来源读取。未来Server关账销售CNY、工价USD，不自动换汇。原状态逐字归档于 docs/tasks/completed/2026-10-20-gate2-inputs/。
