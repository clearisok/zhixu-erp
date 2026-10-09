# 当前状态

> 2026-10-09；当前任务：PR #82 合并冲突与审查收口。历史工程见 [归档](tasks/completed/2026-10-09-pre-trial-state-history.md)，部署/UI 详细证据见 AI_HANDOFF 历史段与 [试用操作说明](../ops/quote-trial/README.md)。

## 试用状态与工程版本

- Windows 独立目标 `zhixu-quote-trial-win01` / `https://localhost:18443` 此前已部署 **READY**：独立新 DB 0001–0008、session/RBAC、COS 新对象、重启持久化与首次备份已验收。用户已解决密码问题、成功登录并打开页面；完整三张人工业务卡尚未确认通过。
- 当前真实应用仍 `zhixu-quote-trial:9ee254db89c6`，source `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`。没有后续部署证据，不能以 Git merge 替代真实更新。
- PR #83 UI 修复已合并 main `dd5fc62e6a4cdf5920528c71cfbd4dbae3c9013d`；新候选 `zhixu-quote-trial-ui:878de323d618` **BUILT / NOT DEPLOYED**，应用source `878de323d618b25fca1f51ccf3f024e932641742`。列表/新建/详情、成本与滚动修复及合成对比图保留。
- PR #82 Windows 工具/部署证据继续保留，在原分支普通整合 main、隔离验证原生命令失败处理，等待审查；Git 冲突解决不等于完整运维安全审查 PASS。

## 验证来源与下一步

- #82 部署阶段定向 14/14 与真实验收是历史证据；#83 Chromium61/61、auth/persistence67/67、SSR2/2、npm674/674、两种frontend与质量检查是 UI 工程证据。本次不重复运行上述测试或真实验收。
- 下一步：审查收口后，另行授权**现有试用环境应用更新**并做人工业务卡；不重新 setup/init，不重新创建账号/验收数据，不将历史导入门禁加回。
- 默认 Browser、旧 3000/3001/3002、旧数据库/Browser 数据不变；本轮不读取真实 secrets、操作 Docker runtime、DB、COS、备份或部署目录。

## 永久边界

- D-096 历史导入 **NOT REQUIRED**；不导入不是删除授权。D-097 显式 Server 不回退旧数据；权限/CAS/事务/精度及历史 Revision 不可变保持。
- 用户持久试用数据不得自动清理；远程必须真实 session/RBAC 与 HTTPS。延期：整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理。
