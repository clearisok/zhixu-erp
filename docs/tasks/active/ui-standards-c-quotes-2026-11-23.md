# Issue165 批次C1：报价模块六项

2026-11-23；按原审查v1批次C模块拆分，仅Q01/Q04/Q05/Q07/Q08/Q09。独立分支fix/ui-standards-c-quotes从经GitHub再次核实main 10b9a7d827e1c09f152ead58c21f26712d49a619 clean创建，HEAD起点同此，不混入A/B代码。Refs [Issue165](https://github.com/clearisok/zhixu-erp/issues/165)、[冻结报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)、[用户批准](ui-standards-approval-2026-11-23.md)。

|编号|实际改动|保留|
|---|---|---|
|Q01|删基础/成本/辅料重复快照教学及QuoteRevision概念句|历史只读、快照实际修改影响、商业确认状态|
|Q04|删除聚焦粘贴区重复按钮；区域标题粘贴或拖入图片，保留Ctrl+V|区域焦点、粘贴/拖入处理、上传状态/错误|
|Q05|删除styleImageAttachmentId技术解释，单句说明当前报价移除后暂无款式图且不自动替换|取消/确认删除、原unlink、历史关系/物理对象不变|
|Q07|PriceVersion/Estimate/PV改业务名称与整张报价估算范围|默认不选、当前估算、重复展示不重复合计、25张/500行/20MB|
|Q08|仅去Server/Browser对照句|正式模板名、版本、全部/当前方案、未保存警告|
|Q09|仅删Server操作记录重复description|事件/筛选/权限；Browser历史说明保持|

本批不改公式、业务回调、接口、存储、数据或权限；D01–D10不实施。V3保守精确路径登记，用户原38项授权覆盖本批。manifest仅更新核实main锚点与时间，其余冻结字段逐项比对保持，旧摘要按Git原字节归档。

## 验证
代码修改后待检查，不预写PASS。Staging既有RECOVERY_BLOCKED / backup_cleanup_unverified（originalFault backup_failed_requires_review）仍阻断，未切版/恢复/重启；Production禁止。
