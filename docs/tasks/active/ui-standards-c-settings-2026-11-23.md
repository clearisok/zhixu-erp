# Issue165 批次C2设置、权限与日志11项

2026-11-23；范围G01–G03、B01–B03、U01–U03、L01–L02，直接实施冻结审查v1批次C对应模块，不新增方案。独立分支fix/ui-standards-c-settings从本轮GitHub核实main 10b9a7d827e1c09f152ead58c21f26712d49a619 clean创建，起始HEAD同此，无继承dirty，不带入其他批次UI增量。Refs [Issue165](https://github.com/clearisok/zhixu-erp/issues/165)、[原报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)、[用户批准](ui-standards-approval-2026-11-23.md)。

|编号|实际实现|保持|
|---|---|---|
|G01|删除dirty检测教学正文|未保存输入丢失后果、两个操作、dirty判定|
|G02/G03|删侧栏报价UI V1及identity后缀|组织/未配置、姓名账号、可信身份/会话错误|
|B01|正式五页面来源横幅及其中重复退出不再显示|候选诊断横幅、统一用户菜单退出、原退出guard和权威源|
|B02|删除面辅料MATERIAL LIBRARY、稳定ID和重复快照教学|供应商列、字段和用量/成本模型|
|B03|仅生产组/外发厂列表UUID移入已有编辑抽屉技术详情|名称/简称/地点/状态、原稳定ID；其他基础设施卡片不动|
|U01/U02|删用户副标题、角色普通教学句|管理员保护、逐项权限说明、影响预览、账号限制和操作后果|
|U03|删除角色确认使用danger，保存仍primary|用户引用阻断、历史保留与原回调|
|L01/L02|删同步记录及正式日志泛化副标题，同步开始日期标北京时间|统计口径、历史标识、日志差异和技术详情；Browser旧日志不动|

同一锁定package-lock已核实，node_modules复用本任务A独立安装目录的junction，仅开发依赖，不含业务缓存/浏览器数据。typecheck首轮PASS，后续检查待记录。


## 发布边界与证据
D01–D10不实施，原12项必要设计保留。不改业务逻辑/数据/权限、API请求或公式。V3保守记录本批精确路径；manifest仅按本轮核实main更新baselineSha/verifiedAt，其他全部JSON字段深比较保持；旧摘要按Git原字节归档。

## 验证
实现后待最终检查，不预写PASS。Staging仍0752，原RECOVERY_BLOCKED / backup_cleanup_unverified，originalFault backup_failed_requires_review；未恢复/切版/重启Worker。Production禁止，不自动合并PR。
