# Issue165 UI整改执行记录
2026-11-23；复用已批准审查方案v1，不重新调研或替换方案。Refs [Issue165](https://github.com/clearisok/zhixu-erp/issues/165)，[完整授权](ui-standards-approval-2026-11-23.md)，[原报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)。

## 本阶段baseline与范围
原迁移工作树chore/juntao-migration-plan/ecceb144和原审查工作树chore/ui-standards-audit/454675fb保持clean。官方交付脚本通过仅本次子进程7888代理，一次push并由独立API精确核实454675fb，DELIVERED_VERIFIED；PR166为Draft/Open未合并。默认代理诊断仍失败，不宣称持久修复，不改共享网络/认证/TLS。

实际main通过GitHub及进程限定fetch一致核实 **10b9a7d827e1c09f152ead58c21f26712d49a619**。本实施工作树fix/ui-standards-a从此clean创建；无继承dirty。开始前HEAD为该完整SHA。

本批严格执行原报告批次A：M01、G04、Q10、Q03、Q02、Q06、P01，共7项。后续沿原批次B的G05–G08，再按原批次C逐模块收口其余27项；不实施D01–D10。分批只是执行既有范围，不新增方案。

## 本批具体前后对照
| 编号 | 原状态 | 本批实现 |
| --- | --- | --- |
| M01 | 表头“单位”，限制只靠悬停 | “关联采购单位”；原有无采购时需求单位回退显式标“需求原始单位”，原值/回退/数量/计算及明细入口均保持 |
| G04 | disabled按钮原因仅hover | 保持禁用及权限判定，关联可访问原因；具名“无权限”info按钮用既有Modal支持键盘/触屏/Escape |
| Q10 | 子编辑Enter/Space被父卡片拦截 | 仅卡片自身按键执行切换，内部编辑按原回调激活 |
| Q03 | 三个隐藏file input仍可聚焦且名称重复 | 真正hidden并移出焦点序列，由原三个具名按钮ref触发，上传/capture/多文件不变 |
| Q02 | 更新确认“是/否” | 原true路径“复制后更新”、false路径“直接更新”，保留只读历史后果 |
| Q06 | 正式价格方案删除提示含mock | 删mock句，保留移除、不可撤销及已有客户确认警告 |
| P01 | 数量/日产缺单位 | 标签及队列表头明确件/件每工作日，最后编辑联动、精确数值及日期不变 |

G04为共享组件V3，其余局部V2；精确路径见本PR ui-changes记录。没有以V0申报可见变化。必要单位、权限、状态和后果仍保留。没有新主题、断点、导航或业务功能。

## 发布元数据与冻结证据
旧manifest锚点4e1f9a51对应上次整合；本轮已核实实际PR base为10b9。只对齐当次snapshot baselineSha/verifiedAt及三份当前摘要，不改任何旧evidence对象、PNG/hash、能力/批准/运行状态。旧摘要逐字归档在completed/2026-11-23-before-ui-standards。此为规定的实际main元数据登记，不将测试失败改为通过，也不修改冻结证据掩盖错误。

## 验证与交付恢复点
本批实现完成，验证尚待实际执行收口；不预写PASS或部署。原报告182/182属于454675fb，不冒作本批结果。当前Staging历史记录仍为0752，未切版。后续每批记录精确HEAD/测试/PR/部署/限制，工程与远端送达分开；不自动合并。
