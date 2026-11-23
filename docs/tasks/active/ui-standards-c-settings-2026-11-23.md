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

## 工程收口
产品UI源码8dc296b28a7b408c52278c30ebf7bcb0344e1e2f；后续仅测试等待/过期文案/owned Chrome生命周期。typecheck、完整lint、Server frontend build PASS；release182/182 PASS（119464ms）。纠正后33aa01bc root1026/1026 PASS（138094ms）；原root一项仍期待正式PostgreSQL横幅，更新为正式隐藏/候选保留断言，所有适配器/保存/authority限制断言保持。

真实built Server+临时PG/Chrome：compact9、production-resources23、team-access8，共40项分别PASS。覆盖六宽度、库/资源编辑、CAS保留输入、明确选项/稳定ID、撤权与会话、全部账号角色、权限修改/删除及审计。初次team把页头出现当数据就绪导致空表/保存未启用并连带账号未创建，新增正向等表与启用控件；L02旧subtitle等待改实际日志筛选，原初始延迟读禁用断言仍保留。

两次team全部七子项通过但owned Chrome close超时，私有profile按原规则保留，未忽略失败。沿既有compact fixture改stdio=ignore避免继承stderr管道，仍用原stopOwnedChromium并要求专有child关闭才删除profile；8/8（51448ms）通过。stderr继承为基于对照的原因推断，未输出或清理未知浏览器进程。该测试修复不进入产品。

没有API/SQL/schema/角色判定或请求数据变化；10争议与关键权限解释保持。Staging原RECOVERY_BLOCKED/backup_cleanup_unverified阻塞，未部署/合并/Production。
