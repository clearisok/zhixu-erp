# 当前状态

> 2026-10-09；当前任务：Windows Quote Trial UI 原地更新。历史工程见 [归档](tasks/completed/2026-10-09-pre-trial-state-history.md)，本次运行证据见 [更新记录](tasks/completed/2026-10-09-windows-quote-trial-ui-update.md)，日常入口见 [试用操作说明](../ops/quote-trial/README.md)。

## 试用状态与工程版本

- Windows 独立目标 `zhixu-quote-trial-win01` / `https://localhost:18443` 此前已部署 **READY**：独立新 DB 0001–0008、session/RBAC、COS 新对象、重启持久化与首次备份已验收。用户已解决密码问题、成功登录并打开页面；完整三张人工业务卡尚未确认通过。
- 已授权并实际更新 app/gateway 至 `zhixu-quote-trial-ui:878de323d618`，source `878de323d618b25fca1f51ccf3f024e932641742`，build `quote-trial-ui-20261009` / `2026-10-09T07:20:46Z`。实际 HTTPS build-info、三服务 healthy、CLI READY 已核对；数据库容器/镜像/卷、TLS/端口及业务内容保持。不是仅以 Git merge 宣称部署。
- PR #82/#83 已合并；本次从 main `edc3598764266de087c0f669f8bcf5452c6d3fd2` 保留 Windows 工具、UI 修复和合成对比图。新旧镜像 schema checksum 一致，未 migration/init/restore。日常工具快照未改，仅更新受限配置的四个非秘密镜像/build字段及目标身份记录。

## 验证来源与下一步

- 本次配置白名单/漂移拒绝与 Windows 原生失败回归12/12、定向lint/diff-check PASS；完整新 dump 与2个现有附件对象备份、原应用恢复、新候选 READY、全业务表保护及旧备份保持均实跑。启动只刷新 `app_roles.updated_at`，离线 dump 逐列证实其余角色内容不变。旧14/14、Chromium61/61等仍按原工程阶段引用，未重跑。
- 管理员/受限账号实际session、列表/详情、2 Quote/2 Revision/2 PV与2附件下载bytes/SHA只读验收 PASS；401/受限权限、Estimate裁剪和403检查通过，验收会话已注销，业务/账号内容保持。**用户新 UI 人工验收 PENDING**：在原地址查看列表/新建/详情/成本/滚动；既有列偏好不清理，采用新默认布局须用户显式恢复默认。
- 默认 Browser、旧 3000/3001/3002、旧数据库/Browser 数据不变。本轮只操作授权 win01 的备份、应用替换和只读验收；不创建业务数据、不写 COS 新对象、不重设账号或密钥。

## 永久边界

- D-096 历史导入 **NOT REQUIRED**；不导入不是删除授权。D-097 显式 Server 不回退旧数据；权限/CAS/事务/精度及历史 Revision 不可变保持。
- 用户持久试用数据不得自动清理；远程必须真实 session/RBAC 与 HTTPS。延期：整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理。
