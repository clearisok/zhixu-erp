# 恢复点：Server 收敛 Gate 2

main `996dfedc12da3527343cd3ff2aa5eea35497e10e`；分支 `codex/server-pr-integration`；初始 clean，先 FF 到已核实 #125/add2d690，再执行 #120/57daca3d 的本地保留历史合并。当前所有增量均属于 Gate 2；没有用户 dirty。唯一实现 owner 维护共享文档和清单，reviewer 只读。

当前恢复：先完成 #120 的融合文档 checkpoint M（原业务代码自动合并；共享状态冲突已按当前 Gate 校准），清单完整保留双方记录但会因真实并行分叉被旧门禁拒绝，不能宣称 PASS。随后实现仅文档 mergeOf 节点与真实 Git 父关系/父支证据并集保护，追加绑定 M 文档 blob 的新节点，再合 #123/ebe4cb16（含 #121/4e075115、#122/349a8458），按同一机制收敛。不要改写原记录、SHA、边或历史提交，也不要忽略门禁失败。详见 Gate2记录。

Gate1已交付唯一草稿 #125，独立API证明完整SHA add2d690a9c3afe6ec1a2633551eaef7dee72ce1；工具错误状态被保留，未重推；Hosted CI待核实。持久空目标 https://localhost:62426 使用镜像8175f628与固定ops d084a586，62业务表0行，1技术管理员，29schema。当前源码继续开发不会改变该目标。证书未安装系统信任。

保留3001/50426/59069及所有旧样本，Gate2只用合成副本与一次性库组合验收；不自动合并、部署、改真实账号/业务库或新来源读取。未来Server关账销售CNY、工价USD，不自动换汇。原状态逐字归档于 docs/tasks/completed/2026-10-20-gate2-inputs/。
