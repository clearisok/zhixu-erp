# 当前状态

2026-10-14核实main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5。本分支feat/order-identity-and-contract-claim，Gate1本地工程PASS，远端交付待完成。GitHub为实时事实，本文为阶段快照。

D-121批准两条创建路径：可信合同创建合同SO、加工批次以后创建加工SO；认领/血统与商业依据独立。[实施计划](tasks/active/order-identity-program.md)。G1已实现合同认领/转交/血统、准备不建SO、列表待认领、创建冲突保护、独立跟单角色。15项领域/HTTP/升级、22项角色、19项来源、5项浏览器、817项源码、71项基线及类型/lint/构建通过。[完整证据](tasks/active/evidence/order-identity/gate1-results.md)。

G2订单独立商业版本尚未实现，当前共享CCT语义不可当成新目标已达成。G3加工批次、G4历史归一、G5页面与来源字段未在本分支实施。真实账号/业务数据库、宁波、18443/18444均未改；不续期Source、不部署、不自动合并。

新分支尚未远端送达，无PR/CI结论；继承NETWORK_DEGRADED，本地与远端分别记录。#108及旧演示/报价转单分支保持；旧通用经销报价转SO不按原方案发布。下一步送达Gate1唯一PR及复审，并按依赖推进G2。

[历史状态](tasks/completed/2026-10-14-pre-order-identity-current-state.md)保留原始日期/hash/结果/限制，禁止冒作最新状态。

## Gate1补充兼容核验（2026-10-14）

用户回传旧HEAD b5c7eb89dc25c397ebf342baa0607705abc80c89交付结果LOCAL_PASS_REMOTE_UNVERIFIED、pushes=0，不能称送达；不再要求重复推送该旧SHA。后续Gate2全量回归发现G1来源读取耦合认领表，现补回本分支：基础来源创建/刷新使用不依赖0014的foundation投影，正式列表/详情仍使用认领投影。不扩大冻结首绑工具的0001-4迁移范围。

独立G1全PG254/255，唯一失败为CCT测试遗漏0014迁移名称，已补；对应CCT12项+静态UI7项重跑PASS。其余新增覆盖：身份15、首次绑定/受控新增19、基线回归71、精确main基线及类型/增量lintPASS。原G1共享CCT仍保持直到G2切换，未将G2提前混入。需要新checkpoint后再次精确基线确认；新HEAD才是待交付对象。

已知范围：无真实DB/账号/部署；Git仍NETWORK_DEGRADED，独立PR/CI未核实。全量一次运行在最后迁移断言修订前254/255，不能把分组重跑冒称已重跑全套。
