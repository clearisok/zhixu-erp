# 恢复点：PR120合入独立CI修复

2026-10-23，root唯一writer、既有reviewer只读。main=`e06162c70c9792895c30030216dc8c2a66368069`。当前`codex/price-source-stabilization`从干净e872继续，合入原PR128精确5f6482cb，只有AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX三冲突由本阶段解决。双方三摘要已Git字节归档。先读[任务](tasks/active/pr120-main-forward-2026-10-23.md)、AGENTS和实际Git状态，不reset/clean/rebase/force。

E原业务5blob=57d，工具3blob=5f，guard/134测试=e061；217证据/46能力/V1 UI impact不变，原H5deb=[e061,57d]见证继续保留。真实merge K=df1789f038f782a5f9633badb224a5a8604afcaf，parents=[e872,5f]。新组合134/134、19/19与精确e061门禁均通过，零失败/取消/跳过；独立静态复审无P1/P2。接着保存最终文档checkpoint、精确门禁及复审，再一次交付原PR120并核实完整SHA/新三CI。app源码不变，已有1b64的804/34DB/6Chromium/类型lint构建保留其范围，不重复冒称新运行体验。

原e872的Source/Team两CI成功、Release因payload旧base失败；原失败保留。工具128已精确送达、Release/Team成功，Source attempt1在端点就绪前20秒超时失败；同一5f已仅重跑一次失败job，attempt2仍待终态，未改超时/测试或代码。独立CI解析器验证真实PR merge的双父身份，从第一父取base，不用旧payload、不降低守卫。未自动合并任何其他PR。

站立Git恢复授权有效，但每可靠checkpoint只一次push/独立exact核实。旧STOP+exact和新远端ref创建已存在布尔采样均保留；认证/TLS/代理配置不变，不能由采样推断所有根因。若使用下一次诊断，另用新targetSHA回执，不覆盖已执行5f driver/回执。所有旧环境与数据保护；完整目标及待决业务范围不变，不重读Source、不绑定/激活/部署。

最终复审仅收窄F/E的启动证据措辞：五个启动相关文件相同，不声称整个应用相同；文档后继不改K业务或工具代码。Git HEAD为当前交付目标，269的已核实CI仍保留其原head范围。

最终状态校准：#128精确5f的Release/Team attempt1和Source attempt2已全成功，首轮启动失败保留且根因未定。269 Release实际eventBaseDiffers=true并对e061通过，证明旧payload场景已覆盖；最终文档HEAD仍须独立交付并核查其三CI，不能借269结果。只修措辞与摘要，无新产品/工具/Source行为。
