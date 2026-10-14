# 当前接力：Gate4案件服务与只读预览

2026-10-14，分支feat/order-normalization-preview；本地基线父提交39c9f7b607eabed5d72845d3a30b7fc766a6ee9d。最近核实main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5，本轮未刷新GitHub。G1–G3未合并依赖保留。NETWORK_DEGRADED及原网络规则未改变，不重复push或自动执行恢复命令。

0017案件与事件保留原SO；只读预览、管理员开案/追加/撤回/重开/查询已接API。证据由服务端同一事务快照采集，unknown不转0；历史append-only，请求幂等、CAS、canonical pair唯一和审计原子性已验证。归一测试36/36、完整类型和定向lint通过，仅合成/一次性tmpfs。首次测试异步语法错误及修复记录在阶段任务。

恢复[Gate4任务](tasks/active/order-normalization-preview.md)及normalization-case-service.ts。下一步管理员案件对照界面/浏览器、完整发布门禁和独立PR收口；有效归属执行/纠正仍待独立工程。预览hash仅有限引用摘要，不能用于批准执行或声称全系统流水覆盖。真实案件写入、Source绑定/调度、订单归一/数据库升级与部署未执行，均须具体范围另行授权。

旧完整接力保留于[服务前接力](tasks/completed/2026-10-14-gate4-pre-service-handoff.md)；G3原接力及全部分支未破坏。CURRENT_STATE描述本地阶段，不代表远端送达、人工验收或部署。

案件UI已接现有订单中心管理员Modal；浏览器5/5及1440/390截图已查看；新增test:order-normalization-ui并接CI，但未远端运行。UI变更范围记录order-normalization-cases.json。下一步完整门禁/源码/PG及精确构建收口预览阶段；归属执行仍未交付。
