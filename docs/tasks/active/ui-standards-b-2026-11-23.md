# Issue165 批次B：共享控件与确认交互
2026-11-23；沿既有审查方案v1批次B实施G05–G08，不重新制定方案。Refs [Issue165](https://github.com/clearisok/zhixu-erp/issues/165)、[原报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)、[明确用户授权](ui-standards-approval-2026-11-23.md)。

## 起始baseline
实际main经本轮GitHub再次核实为 **10b9a7d827e1c09f152ead58c21f26712d49a619**。独立工作树ui-standards-controls、fix/ui-standards-b从此clean创建，无继承dirty；不带入批次A的9个UI路径增量。批次A代码已完成root1026、baseline182、真实10及48项回归，Staging仍因原备份清理保护阻断，部署不PASS。继续本批不代表跳过部署条件。

## 已批准范围与实际实现
| 编号 | 本批改动 | 保持 |
| --- | --- | --- |
| G05 | SearchableSelect从FormItem或显式ARIA参数获得上下文；搜索框具名，controls指向实际listbox、当前选项具名关联 | 原查询、创建条件、选择回调、IME/Enter、定位与权限 |
| G06 | FormItem稳定label/help/error ID及render参数接口；原生宽度错误输入、只读数量hint显式接入；SearchableSelect通过共享字段context接入 | 错误和单位原文、原布局；不强行clone多子控件 |
| G07 | 原报告五处模块共8个checkbox复用Foundation Checkbox | 原checked/disabled/aria、回调、选择集合及上限 |
| G08 | 基础资料4处、报价设置3处、角色1处、关账2处原生确认统一调用Foundation Modal；真正放弃输入复用UnsavedDraftDialog，原请求重发独立“继续核对/重发原请求” | 原pending/busy/dirty、控制器、原编号/输入、未知回执及实际命令；卸载取消未决确认，不跨会话继续 |

共享确认hook仅管理交互承诺和Modal展示；没有API、存储或业务规则，不另建UI系统。仅旧Browser可见的四个删除函数按main原字节保留，避免扩大范围或改变其同步确认时机；reload明确放弃草稿；重发原请求不混用放弃对话框。没有自动确认，不改默认数据、schema、权限、报价公式、请求内容或存储key。

全部作为共享V3登记精确路径；只修本报告明确问题，D01–D10及12项保留设计不动。当前snapshot锚点仅按核实main对齐，旧manifest其他字段及冻结证据不改；旧摘要按原Git字节归档。

## 验证与恢复点
实现后首轮typecheck通过；其他检查待真实收口，不预写PASS或PR/部署。A/B独立分支，合并均由用户决定；后续必要组合验收与Staging发布仍须现有门禁。当前只记录本批工程，不以旧回归替代新结果。

## 最终工程验证（e11c95179457199cb2cbc55d14597ad2f2f5ee26）
- Windows最终typecheck、全仓lint、Server模式frontend build PASS。
- Linux隔离network=none、固定Node24.22.3、原锁定依赖与校验Linux esbuild：release182/182 PASS（181761ms）、root1026/1026 PASS（292522ms）、精确guard PASS，14个UI路径、13页面/68能力。没有改冻结证据/截图/能力字段。
- 实际built Server、专有临时PG/Chromium：compact 10/10 PASS；team-access+closing串行26/26 PASS（109194ms），覆盖字段错误阻止保存、选择器上下文/IME、取消/放弃角色草稿、关账冲突/未知回执及原请求。测试只使用合成账号与数据。
- 保留失败/中断：71fdc552 Linux全检查因实现收窄后源码被替代而取消（未计PASS）；首轮closing未传EXPECTED_SOURCE被正确拒绝，team所有子项通过但Chromium清理超时。未改产品或放宽清理，补源码标识并串行26/26通过。
- 原四个Browser-only删除函数逐字恢复main；本批正式路径确认共10处。不以外部分支A测试代替本批结果。
- 本批无Server/API/SQL/schema/业务数据修改。Staging因原备份恢复门禁不部署，Production未操作。

## 远端CI发现后的G08收口
初次远端source在外部未索引历史场景要求原生confirm计数1；改为实际共享确认操作后，进一步复现本批新交互问题：Shell异步transition等待确认Promise，导致确认弹窗等待自身确认才显示。没有删除该用例。74b175edbfc609b1c60de57ad668c1437cd0c4f7修正角色页/报价设置页的展示调用：不向Shell返回等待弹窗的Promise，接受后通过已有useServerNavigationProtection返回的scope/owner绑定permit再路由。pending/busy、mounted、身份、dirty规则不变，未修改共享Shell/路由/数据或权限判断。

最新真实built Server+临时PG/专有Chrome：closing、compact（含新增报价设置导航取消/接受/0原生二次确认/0写入）、导航连续性、team-access串行62/62 PASS，134137ms。外部历史原条目/草稿保留、一次新文档导航及迟到创建回执跨会话隔离均通过。测试57b3ebc9显式恢复1440 viewport，避免组合前序窄屏条件影响菜单可见性，不改产品/断言。74b175ed typecheck/lint/build、release182/182（135808ms）、root1026/1026（139560ms）、14路径guard PASS；后续只有测试/证据文档。旧CI和复现失败保留，最终CI以更新PR168为准。
