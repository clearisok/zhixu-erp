# 恢复点：当前main镜像隔离演练

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T03:01:20.985Z独立API核实。branch codex/main-persistent-rehearsal-869e从该main干净建立，普通合流已审harness分支fbfecb5753138406404df0307e7c15318cebd73e并保留原历史。镜像仅从精确main canonical archive构建，测试runner第二副本仅覆盖原已审harness；未合并的H/4B/G5/资源/计划/执行/物流/出货代码不进入本镜像。

先读[阶段记录](tasks/active/main-persistent-rehearsal-869e-2026-10-26.md)与outputs/main-persistent-rehearsal-869e-20261026的start/prepared/build-attempt/build-result/image/rehearsal-attempt/rehearsal-result/preservation/final-checkpoint。只继续确认live的原process handle；不因观察超时重启，成功输入不重建。镜像source是N，runner只overlay原harness f03；应用/ops/SQL不变。

只操作本轮两个全新、成功prepared且归属可证明的合成项目。旧容器ID/镜像/状态、网络及所有卷名单在前后只读比较；不读现有config/环境/业务内容/密码或Source私密报告。保护3001/50426/59069/62426、其他旧入口/数据库/对象/卷/备份/Browser。成功后只允许原harness清理本轮自有测试资源；失败保留现场，不重复准备、构建或演练。

PR129已经单独批准合并；本阶段不合并/关闭其他PR，不切换现有入口、不部署正式环境，不采集/绑定/激活/调度Source。H精确交付授权仍保留，Execute/Push/PR/Hosted为0；普通PowerShell同样TLS失败，当前不再探测未改变Git通道，不改共享代理/TLS/认证。所有其余分支、旧结果、卷和备份保持；完整G1–G8/R仍active，人工接受/入口切换/退役及关账业务决定未完成。

未来PR发布134和必要CI保持；后续交期/物流/出货/Server关账与原业务待决/来源范围/入口切换/退役边界仍独立。
