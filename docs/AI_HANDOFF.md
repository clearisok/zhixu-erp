# 恢复点：G6A生产资源当前main候选

实际API核实main 869ee84dd0b31de6161011e4aa560678b244a64d（2026-10-26T01:14:19.128Z）。branch codex/production-resources-main-869e 从该完整对象建立，显式FF至已验收G5 f3a9825beb9320f84ceb98559de2ad6f24bbbee4，普通合流原G6A 6fd11e48c431392bb818f3d502794004727d745c，保留原始历史。只有三份共享摘要与manifest冲突，无业务/UI/SQL代码冲突。

先读[本阶段](tasks/active/production-resources-main-869e-2026-10-26.md)及outputs/production-resources-main-869e-20261026的preview/start/prepared/stage-checks/review/source-checkpoint/guard/final回执，按同HEAD实际终态继续，缺失不算通过。完整非docs等于f441，原73/811/2/14/18和质量/双构建复用，不重跑；当前精确源码守卫另核，未来PR当前base134/三CI保留。

PR129已批准合并，main已核实；4A0d70的新守卫/134通过、4B7df8和G5f3a本地守卫/复审通过，原分支均保留。用户已明确授权仅4A分支精确0d70的一次既有工具恢复交付、远端核实、唯一草稿PR及必要CI；先保存本G6A阶段，再切回该精确分支执行。原Git exit1原因UNRESOLVED，此次具体例外不覆盖资源分支或更换认证/共享配置；遇新STOP立即停止。原G6A6fd在2026-10-24已精确送达一次但未创建PR/CI；这不是当前新候选的送达或通道恢复证明。

当前保护4B7df8f8018798fd0ca717a550db663878ca72ca8e、G5f3a、4A0d70、原6fd、fbfecb持久化镜像演练、db683 CI成本、b611就绪审查、7da累计工程和所有旧环境/卷/备份/结果。本阶段没有重访目标、读取凭据/旧私密报告或真实Source，没有运行0034升级现有库、修改账号、绑定/激活/调度、部署、切换或退役。最新既有运行观察仍归outputs/order-readchain-delivery-main-869e-20261026/runtime-readonly.json，不能据源码导入推算目标账本。

4A具体交付授权已到达，先保存/保护本阶段，再安全切回codex/order-readchain-main-869e精确0d70按该范围执行，不从本资源分支替代推送。后续排单/完成、4C、物流出货、关账及退役按已批准依赖继续，完整Goal不缩减。
