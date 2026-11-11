# Server物料跟进紧凑视图

2026-11-11本机候选，尚未人工接受或部署。业务权威仍为AINUOKE_IT_MATERIAL_SOURCE、D187/D190以及原正式reader；本模块只调整ServerStyleProgressDetailPage和ReadOnlyMaterialControlTower的呈现。

六视图统一切换：自购需求、厂供、采购、入库、出运、出库。自购和厂供始终独立，其他供料类型另保留；分组canonicalKey、顺序与orderMaterialGroups不变。事件视图直接复用原EventTable/uniqueEvents，不引入新关联或合计，未知单位、共享分配、规格问题和未汇总记录仍可追溯。

总览统一表头/紧凑group行，逐行明细和数量点击保留；列显示可恢复所有字段。详情在原Drawer中扩展物料/需求和到料页签，原四流、核实、对账全部保留。到料原Workspace/controller、保存预览、历史、未保存保护和未知请求恢复不改，只将每组内嵌摘要移至到料/详情抽屉；孤立计划仍由原Workspace展示。

localStorage weaveops.material-display.v1仅含density(compact/standard)及hidden列名，默认compact，未知内容忽略、存储失败不阻止业务；名称和操作不可隐藏。不缓存订单/身份/来源响应。所有API、权限门禁、刷新队列、页面30秒只读轮询均不变。来源时间/历史/刷新失败提示保留。

真实本机演示使用独立库zhixu_ui_dense_20261111（原本机617订单完整快照副本），仅在该副本经现有importVerifiedMaterialArchive接纳PI2610-181的14:44真实来源，原UUID保持aa46192f-23b0-4fd9-9a37-55acc7703783，未创建新订单、无源请求。原本机617库与staging不写，候选只读HTTP防护，原loopback专用demo session和原只读身份复用，不增加权限。示例统计为该来源时点，不硬编码10项。

变更路径及完整功能盘点/验收在docs/tasks/active/material-dense-local-2026-11-11.md。受影响回归包括真实只读UI/数据逐项对照，隔离合成环境原分批到料写流程及权限测试、类型/lint/构建。未完成功能明确待核实，不以HTTP200或截图单独冒称完整交付。
