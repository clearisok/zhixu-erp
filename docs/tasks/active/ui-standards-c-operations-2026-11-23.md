# Issue165 批次C3订单、物料、排单与关账10项

2026-11-23；范围O01–O04、M02–M05、P02、C01，直接实施冻结审查v1批次C对应模块，不新增方案。独立分支fix/ui-standards-c-operations从本轮GitHub核实main 10b9a7d827e1c09f152ead58c21f26712d49a619 clean创建，起始HEAD同此，无继承dirty，不带入其他批次UI增量。Refs [Issue165](https://github.com/clearisok/zhixu-erp/issues/165)、[原报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)、[用户批准](ui-standards-approval-2026-11-23.md)。

|编号|实际实现|保持|
|---|---|---|
|O01|列表/详情缺权限合并为单一ErrorState，显示账号与联系管理员路径|原权限判断、认证和受限数据清除|
|O02|区分目录未完成读取、已有目录无匹配、已读空目录|原查询、分页、跟进和采集；不触发同步|
|O03|仅映射现有客户端有界HTTP/网络/关联错误，未知保持未知；重新读取物料只调用state.reload|原30秒读取、scope/abort/归属校验；ServerContractRefresh仍单独明确真实刷新|
|O04|取消加工批次确认使用danger|原原因、已生成订单保护和不可再导入后果|
|M02|对账页签改货款申请|原来源明细、申请不等于实付和不重复合计限制|
|M03/M04|单一假页签改普通关键词优先级标题；正文按已有route判断返回名称|原顺序/规则、保存、未知结果保护和返回地址|
|M05|来源时间Asia/Shanghai显示；北京时间可见，技术详情保留原始time/dateTime|fetchedAt、陈旧判定及来源时间事实|
|P02|零生产组只呈现一个跨桌面/窄屏可见EmptyState；搜索无匹配准确区分，原生产组设置入口按既有edit权限显示|不创建资源，不改权限；主从列表有记录时不变|
|C01|字段及可访问名改汇总及明细范围，删重复不变性说明|原scope查询、汇总/明细、金额/币种/月份；不改全年卡片争议D07|

错误反馈不直接显示raw error；503不能证明来源未接入，明确服务暂不可用、来源就绪尚未核实。现有http-client丢弃响应错误细节，本批不扩张API或猜测源站状态。新增最小错误映射/上海跨日测试，原E2E selector只跟随新字段名，断言未削弱。依赖junction复用本任务A的同锁定公开开发依赖，不接入业务缓存。


## 发布边界与证据
D01–D10不实施，原12项必要设计保留。不改业务逻辑/数据/权限、API请求或公式。V3保守记录本批精确路径；manifest仅按本轮核实main更新baselineSha/verifiedAt，其他全部JSON字段深比较保持；旧摘要按Git原字节归档。

## 验证
实现后待最终检查，不预写PASS。Staging仍0752，原RECOVERY_BLOCKED / backup_cleanup_unverified，originalFault backup_failed_requires_review；未恢复/切版/重启Worker。Production禁止，不自动合并PR。

## 工程收口
产品首次b52a7314505b1fd22b90708f7c01f4782f946f77；55175716将唯一关键词标题保留在已加载字段分支（首轮标题提前出现，五个依赖就绪的物料用例连带失败，已真实修正，未放宽断言）。后续bba12e54仅将旧订单权限文案断言更新为单一ErrorState，401/403和无Browser回退断言保持。

typecheck、完整lint、最新Server frontend build通过；release182/182 PASS（141982ms）；纠正后root1028/1028 PASS（158192ms），含新增脱敏错误映射及上海跨日两项。原root1027/1028旧“没有订单查看权限”文案断言失败保留，不计PASS。

实际built Server+合成PG/专有Chrome：最新55175716 compact+物料21/21 PASS（99825ms），含GET重读不触发采集、401/403/网络分工、上海时间/原dateTime、有/无orderId返回名称、单一标题、1440/390零生产组空态。关账18/18及排单37/37在前一b52产品构建通过，后续唯一UI变化只在进度设置标题加载位置；全年度/筛选/金额、丢回执、原请求、并发/撤权/历史/精确小数/响应宽度均保留。

10个产品路径（含显示反馈TS helper）按V3精确登记，无API/SQL/schema/业务公式/数据/权限变化。原source capture保持单独ServerContractRefresh，GET重读只state.reload。Staging原恢复门禁阻塞，不部署/合并/Production。
