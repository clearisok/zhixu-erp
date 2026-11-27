# 接力：Issue177 / PR178 P1–P4 局部优化

2026-11-27；feat/order-workbench；阶段起点0787ae72815384a19779b5e4ae90e7d24db4fc8e clean，main10b9a7d827e1c09f152ead58c21f26712d49a619已fetch。用户v2明确批准，见[批准](tasks/active/order-workbench-refinement-approval-2026-11-27.md)、[当前任务/完整阶段记录](tasks/active/order-workbench-refinement-2026-11-27.md)。只沿PR178，不合并/部署/改DB或真实数据。

最终UI c856f35f1caa073c829976c829513f6e941d44df已一次push并核验精确送达。关注紧凑、指定说明/计划重复对照删除、保留差异/精确行/作废/重新读取及维护；物料按自购需求项统计，不跨单位合计、记录不表示完成。旧来源显式标历史，当前比例/待处理仍待核对；厂供/其他供料留原详情。

c856 Server前端Build及真实6233最终51/51通过，6宽3页签及手机标题定位；1ba四套UI44/44清理通过；12dd root1032/1032、release182/182与精确9路径守卫通过，新增历史纯统计7/7。最后Typecheck/Lint复核进行中；7PNG/工程/新运行指南即将证据checkpoint，绑定新清单后还需最终根/两条发布检查，不借旧PASS冒充。

本机5177实际API只读Demo运行，/__demo和build-info=c856。真实来源截至21:43:38，后判stale，历史16自购、15采购记录、12入库记录、10历史待入库，16完成未知；未采集/绕过来源限制。业务非GET本机403，凭据不输出/落盘。Hosted旧0787有失败/取消，本轮修复compact driver旧selector，新CI单独核对。

[新版运行指南](tasks/active/order-workbench-refinement-demo-2026-11-27.md)、[新截图/证据](release/evidence/order-workbench-refinement-20261127/engineering.md)。旧共享摘要逐字归档到tasks/completed/2026-11-27-before-order-workbench-refinement，旧冻结证据不覆盖。官方git-delivery.ps1一次push，等待脚本完全结束再编辑；最后更新原PR/Issue Review，保持Issue开放，无auto-merge。

证据d3f1b1a24303cb44215ec7defab050bc0e9eb068已一次push精确送达；708条候选manifest SHA256=f4a9b6c6ffd9f4d220bc12eab6955d1d4bacdc86f1452f2e9a9670b1b99b2285，10新记录绑定既存checkpoint，旧记录/状态未变。最终Typecheck/完整Lint均exit0零警告。Windows守卫无结果主动停止不记PASS，最终根/两条发布检查使用隔离Linux实际Git副本，待本清单checkpoint后执行。
