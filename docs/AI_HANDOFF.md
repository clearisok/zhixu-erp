# 2026-11-19 紧凑业务页面接力

分支feat/compact-business-pages，从独立核实main4a8c9bc24b00983d0d79150349adeed5a333a237建立。原clean操作分支de6f36b7完整保护，未合并至本次分支。Refs Issue155；用户明确授权完整四截图UI实现、Draft PR和Staging候选部署，未授权合并/Production。不得改业务规则/示例价格写真实库。

授权/范围/测试在[任务文档](tasks/active/compact-business-pages-2026-11-19.md)。开始实现前检查已完成：server真实PV/CCT确认价businessValues已存在，可直接使用；AppShell持续壳需要页面owner portal承载顶栏actions；订单维护组件/安全导航保持。保存偏好需要幂等向前、保持个人隐藏/字段模式/权限，不清业务存储。

fetch因现有127.0.0.1代理拒绝NETWORK_DEGRADED，GitHub连接器main确认4a；开放PR136不涉及页面。按有界Git交付协议，不重试失败通道/改全局代理。当前仅初始契约checkpoint，尚未实现/测试/PR/部署。后续通过真实浏览器和必要测试再交付，不把历史通过结果冒称本次。

最新覆盖初始方案：用户v2明确永久取消款式进度列表/风险预警，原迁移二级菜单要求作废；订单中心只保留订单列表。已做依赖审计，保留共享物料详情路由、ControlTower、Summary、数据/表/Repository/API；清理两专用根路由、导航组件/引用、两个专用页面及列表私有导入UI。详情返回订单列表，不留死链。详见任务v2。第一版源码b1e45bd8已完成17项价格专项、typecheck/lint和Server前端build；之后用户调整产生新代码，最终候选需重新必要验证，不能冒称旧结果覆盖v2。
