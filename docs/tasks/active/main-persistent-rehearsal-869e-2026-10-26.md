# 当前main持久化候选与隔离恢复演练

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T03:01:20.985Z独立API核实。branch codex/main-persistent-rehearsal-869e从该main干净建立，普通合流已审harness分支fbfecb5753138406404df0307e7c15318cebd73e并保留原历史。镜像仅从精确main canonical archive构建，测试runner第二副本仅覆盖原已审harness；未合并的H/4B/G5/资源/计划/执行/物流/出货代码不进入本镜像。

## 范围和验收计划

复用原fbfecb的prepare归属、项目网络及受保护端口修复，harness blob为f03ac2adcb7aa27695565ade10c788a070161144。旧M镜像8/8只作历史，不能冒称新N已通过；本轮先逐blob核main archive/31份SQL，再单次build及单次实际镜像8项演练。只有完整8 pass/零fail/skip/cancelled及前后保护回执成立才算通过。

覆盖空schema显式初始化、TLS/对象凭据/桶负测、合成Quote/PNG、重启/冷重建、原备份工具和独立DB+对象恢复。应用/ops运行脚本/SQL不修改；测试工具修复以独立runner身份记录。最多一次构建、一次实际演练，不以网络问题无限重试，不关闭TLS/包签名或安装host依赖。

只操作本轮两个全新、成功prepared且归属可证明的合成项目。旧容器ID/镜像/状态、网络及所有卷名单在前后只读比较；不读现有config/环境/业务内容/密码或Source私密报告。保护3001/50426/59069/62426、其他旧入口/数据库/对象/卷/备份/Browser。成功后只允许原harness清理本轮自有测试资源；失败保留现场，不重复准备、构建或演练。

当前只是准备阶段，镜像build/8项演练/最终guard尚未发生，不提前PASS；以outputs/main-persistent-rehearsal-869e-20261026同源码/同HEAD实际回执为准。旧[演练记录](main-persistent-rehearsal-2026-10-25.md)保留原M/source/hash/结果/限制。

PR129已经单独批准合并；本阶段不合并/关闭其他PR，不切换现有入口、不部署正式环境，不采集/绑定/激活/调度Source。H精确交付授权仍保留，Execute/Push/PR/Hosted为0；普通PowerShell同样TLS失败，当前不再探测未改变Git通道，不改共享代理/TLS/认证。所有其余分支、旧结果、卷和备份保持；完整G1–G8/R仍active，人工接受/入口切换/退役及关账业务决定未完成。

正式PR交付仍须当前精确base源码守卫、发布134及必要三CI；本轮不重复未受影响的全仓质量或功能测试，不把历史结果称为新执行。
