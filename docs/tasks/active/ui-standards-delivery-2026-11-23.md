# Issue165 UI规范整改交付清单

> 2026-11-24恢复点：38项本地实现及检查已完成，五个独立PR存在。C3最后一项错误分类补正只在本地，远端2913e333未包含它；NETWORK_DEGRADED下停止后续自动push，需安全补送后才算完整远端交付。Staging仍受原恢复门禁阻塞，当前不能集中验收整改版本。

2026-11-23；仅原审查v1明确38项，10项设计争议D01–D10不实施，原12项保留设计不自动重做。原[规范及报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)已正常交付并通过三项CI；报告v1 Git blob保持454675fb53444208bc066de271791cb114b105f9。

## 独立交付
|批次|范围|独立分支|PR|
|---|---|---|---|
|A|7项|fix/ui-standards-a|[167](https://github.com/clearisok/zhixu-erp/pull/167)|
|B|4项|fix/ui-standards-b|[168](https://github.com/clearisok/zhixu-erp/pull/168)|
|C1|6项|fix/ui-standards-c-quotes|[169](https://github.com/clearisok/zhixu-erp/pull/169)|
|C2|11项|fix/ui-standards-c-settings|[170](https://github.com/clearisok/zhixu-erp/pull/170)|
|C3|10项|fix/ui-standards-c-operations|[171](https://github.com/clearisok/zhixu-erp/pull/171)|

所有任务起点为GitHub核实main **10b9a7d827e1c09f152ead58c21f26712d49a619**，独立工作树clean创建，不含原分支迁移方案和无关工作。每批精确远端SHA由官方有界交付工具核实；最终HEAD/CI以对应PR及Issue165交付回执为准，不用早期产品见证SHA冒充最终文档HEAD。没有自动合并或Production操作。

## 逐项清单
|编号|已实施整改|批次/PR|
|---|---|---|
|G01|删除dirty检测教学正文，保留丢失输入后果|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|G02|删除侧栏报价UI V1|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|G03|身份显示保留姓名账号，删除identity后缀|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|G04|无权限按钮关联原因并支持键盘、触屏及Escape|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|G05|搜索选择器具名并关联真实listbox|B / [168](https://github.com/clearisok/zhixu-erp/pull/168)|
|G06|FormItem稳定label/help/error关联接口及调用接入|B / [168](https://github.com/clearisok/zhixu-erp/pull/168)|
|G07|五模块八处复选框复用Foundation|B / [168](https://github.com/clearisok/zhixu-erp/pull/168)|
|G08|正式路径十处确认统一，放弃与原请求重发分离|B / [168](https://github.com/clearisok/zhixu-erp/pull/168)|
|Q01|删除报价基础/成本/辅料重复快照教学|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q02|版本选择按钮明确复制后更新/直接更新|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|Q03|三个底层file input真正隐藏，由具名按钮激活|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|Q04|删除聚焦粘贴区重复入口，保留区域和快捷键|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q05|删除款式图确认保留准确后果，删除技术字段说明|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q06|移除mock阶段危险提示，保留不可撤销/已有确认警告|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|Q07|内部汇总使用价格方案/估算成本业务名称|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q08|删除导出Server/Browser对照，保留模板/范围/未保存警告|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q09|删除正式报价操作记录重复副标题|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q10|卡片键盘仅响应自身，内部编辑Enter/Space可用|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|B01|正式五页面隐藏工程来源横幅与重复退出，保留候选诊断|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|B02|精简面辅料页头/抽屉教学，供应商字段保留|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|B03|生产组/外发厂UUID移入已有编辑抽屉技术详情|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|O01|订单列表/详情权限失败合并单一明确ErrorState|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|O02|目录未读/已读空/搜索或范围无匹配分别提示|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|O03|物料读取脱敏分类，GET重读与来源采集分离|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|O04|取消加工批次确认使用danger，后果保留|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|M01|明确关联采购单位；无采购时真实需求单位显式标明|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|M02|对账页签改货款申请，非实付/不可重复合计限制保留|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|M03|移除单一假页签，只保留已加载字段区一个标题|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|M04|返回名称按已有订单上下文确定，地址不变|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|M05|来源时间显式Asia/Shanghai，原始dateTime按需可见|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|P01|排单数量/日产/队列表明确件与工作日单位|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|P02|桌面/窄屏只显示一个零生产组空态，设置入口按原权限|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|C01|字段名明确汇总及明细范围，删除重复不变性说明|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|U01|删除用户管理泛化副标题|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|U02|删除普通角色教学，保护/权限定义/影响预览保留|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|U03|删除角色确认danger，保存仍primary|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|L01|删除同步记录泛化副标题，筛选明确北京时间|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|L02|删除正式日志泛化副标题，时间/差异/技术详情保留|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|

## 验证与限制
- 各批typecheck、lint、显式Server frontend build、release182及精确UI影响门禁；A/B/C1/C2完整root1026，C3增加错误/时区两项后1028。各阶段精确输入SHA、初次失败与修正、实际页面数量见同目录对应批次记录。B远端发现的导航事务/确认交互必须修复、重跑并核实CI，不能仅以本地root通过交付。
- A真实compact10、排单/物料48；B真实compact/团队/关账及导航按最新修正结果收口；C1compact9；C2compact9/资源23/团队8；C3最新compact/物料21、关账18/排单37在对应产品构建通过。全部使用owned临时PG/Chrome与合成数据，没有真实ERP/客户数据写入。
- 额外本地组合13fd757e前后分别验证共享兼容；早期组合7710684d root1028、release182、guard38路径、真实compact/团队/关账38通过。随后接入B确认事务修复，最终组合检查另记，旧组合结果不冒充最新。组合只是本地自查，不合并GitHub PR/main，不是部署。
- 扩展Quote套件78项中71通过、7失败（含父级），实质三类：旧币种夹具PUT、旧默认列集合、1280旧严格列宽。独立无修改main10b9使用相同参数及原脚本复现完全相同三类；列宽均table1104/container1021。没有跳过测试或修改业务/冻结布局来消除失败；该套件仍不能宣称全PASS。详C1记录与PR169。
- 原manifest仅按实际main对齐baselineSha/verifiedAt，其他字段深比较保持；原证据文档、截图hash、权限/来源/运行能力记录不变。旧三份摘要原Git字节归档。

## Staging：未部署
发布前及本轮末只读核实：仍为0752d64f309d68b6e52afbbd712d28e0d9db9c1e，镜像sha256:9d638f7691cff7ba9d6b7b2531373c37e6f9bd1ea7ea430a16e97d1fe3354bd9。Supervisor仍RECOVERY_BLOCKED / backup_cleanup_unverified，originalFault=backup_failed_requires_review。当前有效配置runtime/catalog-sync-0752d64f/trial.conf，根runtime/trial.conf为旧配置，未误用。

访问地址仍为[Staging](https://staging.weaveops.top)，**目前不是本轮整改版本，不能用于验收这38项**。没有解除保护、清pause、改回执、重启Worker、恢复数据库或切版。恢复清理正向证据未通过前无法安全部署；UI发布授权不能代替原恢复门禁。此项是独立发布阻塞，所有PR保持待集中验收。

## 人工验收
未将工程检查、候选构建、远端送达、真实部署或用户认可混同。现有业务逻辑/数据/权限/公式不变；单位、错误、提交/只读/权限状态和危险后果保留。10争议继续等用户单独决定。完成本轮可安全工程后，将真实剩余阻塞统一报告；不反复请求逐批批准。

## 2026-11-24最后状态
B最新修复产品74b175ed的四套真实62项、root1026、release182、typecheck/lint/build/guard均PASS；B最终83ed26fd已精确送达。C1最终8ab2ef04含审计等待修正，真实team8通过且精确送达；C2最终07fc0dc7的三项CI全成功。C3原远端2913e333与本地末次O03补正分别记录，不能混为远端PASS；最新本地产品616cee91的root1028、release182和真实compact10通过。五PR最新CI见Issue165最终回执；原Quote套件三类main失败保留。

Git通道再次uncertain_transport预检后虽API证明既有checkpoint送达，仍NETWORK_DEGRADED；没有反复push。仓库AGENTS明确要求后续只保留本地checkpoint、恢复命令不自动执行。安全命令绑定精确SHA，先校验dirty/祖先/远端，最多一次普通push并独立核实；没有force/reset/clean或共享配置更改。该限制与Staging备份清理保护是两个独立阻塞。
