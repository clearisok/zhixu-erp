# 当前状态

> 2026-10-10：PR #91 / D-102 用户验收修正。普通电脑“新建报价”立即原子创建有编号草稿、进入正式详情，不再要求两步页。**ENGINEERING PASS / USER ACCEPTANCE PENDING**；Linux候选已验证但尚未更新Preview，不自动合并。

## 当前工程

- 同一可信 receipt/Quote writer/编号/事务/审计；双击防重，挂载/刷新不创建，未知结果只核对原 token。空草稿保留；类型只读，generic PUT不能绕过专用类型切换保护。
- PostgreSQL全局设置保存可空默认类型/国家、已有默认制作预设；active/国家/版本校验，未配置类型明确为经销技术回退。新PV、工序和其他费用为独立快照，设置变化不回写已有报价。
- 设置页整理为创建默认值/通用计价、制作预设主从管理、补充项；权限只读、409草稿保护、重置未保存修改与离开提示。详情顶部紧凑制作信息条，参数编辑复用现有权限/UI。
- 已有列表100px/偏好/正式缩略图、编辑、Revision/PV、Estimate、确认、附件、Excel/ZIP/内部汇总/日志保留。Intake、完整已有报价类型切换、Excel列筛选、整单复制/删除、Revision删除及转订单不在本轮。
- 新forward-only0011只增加两列，旧0001–0010 Git字节不变；非空升级只应用0011、旧业务数据/原checksum保持。正常启动verify-only。订单PR92文件交集为零，未操作其工作树。

## 验证与交付

本轮实际创建28/28、Quote/Q3 API28/28、local3/3、版本/Estimate/附件24/24、auth/frontend85/85；最终完整Chromium66/66、列表像素/缩略图27/27、npm679/679、typecheck/lint/Server和两种frontend PASS，默认build-info browser/browser/writable/session。源码236cc9b的不可变Linux候选已验证发布checksum、非空库仅升级0011、原数据/回执/重启保持及cleanup；packaging12/12 PASS。[详细测试、合成截图与候选](tasks/active/quote-two-step-creation.md)。

原分支 `feat/quote-two-step-creation`；前次push网络故障已由用户恢复，发布审查起点local/tracking/PR91均e58e6de。发布审查补齐generic PUT追加不同类型Revision的绕过保护（29/29创建、10/10版本回归）；新修复候选收口中，旧236cc9b镜像不能代替补丁版本。当前来源/PR见接力，不无限重试或强推。

## 环境与下一步

**18444仍是旧bb451fe/66de两步版、0001–0010**。2026-10-10本轮只读复核：健康、28报价/2启用账号/3附件及对象、1committed回执无pending；完整挂载/配置/TLS连续性与前十份checksum PASS。旧备份缺少后续业务变更，不能代替本次新备份。0011及app更新仍须单独授权维护、当前完整备份/隔离恢复；本轮未修改Preview，不改18443/真实库/COS/旧3000–3002。

后续用户批准Preview备份/隔离恢复及0011/app更新后，才进行新交互/默认设置/响应式人工验收；工程PASS不是人工PASS。[历史部署接力](tasks/completed/2026-10-10-pr91-two-step-handoff-history.md)和[旧项目证据](tasks/completed/2026-10-10-pre-two-step-state-history.md)保留，旧“取消零创建”不再是当前普通电脑规则。

D-096历史导入NOT REQUIRED；D-097无Browser业务回退、D-098 Quote-first、D-099原版视觉与Server能力底线、D-101剩余业务目标保持。默认Browser不变；新Server能力与真实部署分别记录。
