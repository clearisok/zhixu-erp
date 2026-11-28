# 当前：PR178合并/Staging授权执行中

用户新授权已覆盖必要修复、仅178合并main、Staging部署及只读验收；不授权Production/其他PR合并/数据库业务或调度清理网络变更。[当前阶段与保全方案](tasks/active/order-workbench-staging-2026-11-27.md)。起点415a99c2 clean/main10b9，source失败及Review P2正在修复，尚未合并或部署。

Staging实际220ec86c包含未合并PR176/172/173与存储v2，不能直接main覆盖；拟独立部署候选保留220完整能力后集成178，原库/对象/迁移/Worker调度保持，正式备份门禁失败即停止部署。下文保留上一阶段验收快照（历史）。

# 当前：Issue177 订单工作台 P1–P4 / PR178待用户评审

2026-11-27；分支feat/order-workbench，阶段起点0787ae72815384a19779b5e4ae90e7d24db4fc8e clean；开始fetch及交付前只读核实main10b9a7d827e1c09f152ead58c21f26712d49a619。[用户局部v2批准](tasks/active/order-workbench-refinement-approval-2026-11-27.md)、[最终阶段/工程结果](tasks/active/order-workbench-refinement-2026-11-27.md)。原[PR178](https://github.com/clearisok/zhixu-erp/pull/178)已更新中文P1–P4说明、统计口径及前后截图，Issue177回Review并保持开放。

关注横排、指定常驻辅助说明及重复计划对照删除；精确计划/空日期/作废历史/实际差异、原维护/重新读取保留。物料原卡显示真实自购需求项、采购/入库记录项数及可判定的完成率/待入库明细。记录不表示完成，未知不补0，不跨单位累计；没有改API、schema、权限、关联、同步和业务规则，其他执行模块本轮不改。

[新版Demo运行步骤](tasks/active/order-workbench-refinement-demo-2026-11-27.md)、[7图与时点证明](release/evidence/order-workbench-refinement-20261127/engineering.md)。本机5177实际ERP/认证GET，业务非GET本机403。实际UI构建c856f35f1caa073c829976c829513f6e941d44df，6233真实51/51。来源21:43:38后判stale，16自购/15采购记录/12入库记录明确上次来源，10项旧待入库只历史展开；当前完成/待处理待核对。原出货503及完整整单变更接口缺失仍保留。

最终708条证据提交9af74ab9aaa0bd34e8441fcea02933f37cb69ae4及精确远端已核实；root1033/1033、release182/182、9路径守卫通过，最终c856四套UI44/44与owned清理通过，最终Typecheck/完整Lint零警告/Server前端Build通过。Windows守卫无结果主动停止不记PASS，最终源码/根/发布在隔离Linux实际Git副本复核，不改共享配置。后续只结果文档，最终HEAD再验源码守卫。9af Hosted baseline成功，source/team-access尚在运行，不宣称CI全绿或人工认可。

旧共享摘要[逐字归档](tasks/completed/2026-11-27-before-order-workbench-refinement/CURRENT_STATE.md)，旧冻结证据保持。PR171/172/176共享文件合并风险保留。下一步用户体验/代码评审；不合并/部署/写真实数据、不改服务器配置或启用自动合并。

修复Gate：产品8e1a/driver12239，typecheck/完整lint/build PASS；root1033、release182、精确main10b9守卫PASS；实际Chromium三套35/35 PASS。Review P2已回复解决。当前Staging仍220，HTTPS/健康/6233只读API200，无部署；最终HEAD三CI通过后才能merge。详见任务新结果。

2026-11-28：当前36ce source在后续catalog旧文案断言失败，其他两CI通过。本地catalog加强真实来源/项数/未知验证已完整通过，CI整体预算35分钟保留全部检查；新代码尚未远端交付（NETWORK_DEGRADED）。只有新最终HEAD全CI成功后才合并178/部署；Staging实际220及原Worker继续运行，无线上更改。
