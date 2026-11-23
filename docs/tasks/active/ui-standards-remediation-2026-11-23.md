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
本批产品源码checkpoint为ba269e340be0529a565024fe9a001dac1ff6eb7a，已通过正式脚本单次push及独立API核实送达。67项定向回归、typecheck/lint、Server前后端构建通过；精确main门禁PASS（13页/68能力/9 UI路径）。本批Linux隔离容器的发布回归182/182通过，142306.183849ms；root全量仍运行，不预写结果。原报告454675fb的旧182结果不冒作本批结果。

真实构建＋独有临时PG/Chrome的紧凑页面回归10/10通过（73233.4333ms），包括新增Enter/Space编辑、父卡片切换、三隐藏file input、0命令提交、权限原因关联/键盘/触屏/Escape/焦点恢复。首轮键盘事件未带原生Enter字符而超时、次轮未等待现有rAF恢复焦点的失败均不计PASS；仅修正私有合成回归事件与等待，不改产品行为来迎合断言。排单前27个子项通过后，旧测试未等异步仓库选项即读取disabled而失败，保留原断言并补正向等待；物料回归因默认构建只有短SHA而在40位身份前置阻断，下一构建显式绑定完整SHA，不放宽身份断言。

2026-11-23部署前只读核实：当前app/gateway仍0752镜像9d638f76…，实际有效配置在runtime/catalog-sync-0752d64f/trial.conf，根runtime/trial.conf是旧562fbf配置，不能误用。Supervisor当前RECOVERY_BLOCKED/backup_cleanup_unverified、originalFault=backup_failed_requires_review，发生于本批切版前；未解除保护、改回执、重启Worker或清pause。此项为Staging发布阻塞，UI代码及PR独立推进；没有门禁PASS不部署。原DB/对象/卷与LAN入口保持。

## 批次A工程收口

产品及最终测试输入为5707cd333fbae563b5f3f8f98af94b395ed399bf；后续只追加本段及当前接力，无产品/测试/manifest变化。

- 完整root：Linux隔离、network=none，1026/1026通过，0失败/取消/跳过，204620.899134ms。精确main门禁PASS，检查HEAD=5707cd33、base=10b9、9个UI路径、13页/68能力。
- 发布回归：182/182通过，142306.183849ms；独立root亦包含这些用例。typecheck、完整lint、最终改动文件lint、Server前端build及server:build通过。
- 真实Server构建＋独有PG/Chrome：紧凑页面含新增键盘/触屏场景10/10；排单与物料合并48/48，177398.6447ms。物料六宽度、抽屉/未知单位/来源事实/七角色，排单精确小数、原请求/未知结果/并发/撤权/历史与桌面移动几何均通过。未访问真实ERP或写Staging业务数据。
- 初始Linux root因错误依赖挂载找不到jszip等而953/961，不计PASS；Linux在线依赖安装ECONNRESET也不计PASS。最终修正node_modules真实路径，并仅提供现有锁文件0.25.12精确SHA512匹配的Linux esbuild二进制；未改锁文件、测试断言、冻结证据或降低检查。最终完整1026成功属于正确隔离环境，不覆盖原失败。
- 截图来自合成隔离记录；已目视核对权限弹窗，原真实业务截图不提交。原Staging备份清理保护仍为发布阻塞，未部署本批，不宣称Staging PASS。

后续每批记录精确HEAD/测试/PR/部署/限制，工程与远端送达分开；不自动合并。部署受既有保护阻断时，继续彼此隔离的已批准代码批次，不跳过发布条件。
