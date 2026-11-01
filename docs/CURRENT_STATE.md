# 当前切片：侧栏折叠定位已同步体验站

2026-11-01；用户要求“同步到体验站”，宁波 https://staging.weaveops.top 已运行精确代码 f21c96c1899126028ba9a272727ad8d564ccf185，构建server-preview-f21c96c1-e4874825be。分支fix/sidebar-collapse-alignment，基线main cb5cc29baa49ed7115fdb6c9506b6a80356936ea。本地任务代码尚未合并或推送，体验部署与GitHub交付分别记录。

桌面菜单展开/折叠保持相同位置，正文仍可扩展。真实组件本地三桌面/三响应式状态通过，相关28项与完整发布基线182项通过；公网已加载同一修复CSS，登录/订单/报价API读取通过。独立备份恢复及精确候选启动通过。3张订单、2份报价和2份附件保留，无数据库迁移。

更新前后成对备份、恢复镜像及异机副本均已验证。已有物料同步的原三合同范围、operator和300秒间隔不变；运行身份已安全前向更新，20:05:11北京时间完成第30轮，HEALTHY。旧资产不清理。公网宁波Python探针403与本机Node公网成功分别保留；真实登录后的侧栏点击本轮未重复，不冒称完整业务UI验收。

详见[本片](tasks/active/sidebar-collapse-alignment-2026-11-01.md)及[公开交付回执](../artifacts/sidebar-collapse-alignment-20261101/staging-delivery.json)。完整项目目标仍未结束；Git网络没有新恢复证据，未重复推送/CI。此前全局状态见[原main归档](tasks/completed/2026-11-01-before-sidebar-alignment/CURRENT_STATE.md)。
