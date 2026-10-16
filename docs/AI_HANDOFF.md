# 恢复点：订单业务来源候选收口

2026-10-17 / main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。实际树ainuoke-live-readiness/zhixu-ainuoke-api，分支feat/order-business-source，从clean ac620305af04cf8f8d8ad5ec5f254a68a6ccdd04开始，当前修改均为本阶段。旧接力逐字保留[此处](tasks/completed/2026-10-17-before-business-source-handoff.md)。先读CURRENT_STATE、ORDER_BUSINESS_SOURCE与D144。

新业务规则已明确批准，无负责人/认领/转交/准备；合同先有艾诺科，加工保留独立入口。business-source采用不可变产品条件+商业版本，旧公开写API410，历史内部服务和数据保护测试保留。不要重新启用旧五套UI入口，也不要删除旧记录。当前107+83后端/兼容、6新UI通过；加工UI9/9、根898/898、基线94/94及main源码门禁均通过。冻结证据已前向绑定b3d71565，旧hash未改。

源码333d7cb2854bc761c28b46e66b8dfc525cb16f90已打包并启动新62326隔离可编辑副本；私有目录outputs/isolated-private-93d2596e-d315-4da5-90ae-2038476f6be8含clone-manifest/凭据/备份/启停脚本和回执，禁止打印manifest全文。原62316目录outputs/isolated-private-3a6aefbe-bcf9-4bbe-92a7-d3bd226a7cfe不写/不续期；原五表指纹保持。新5SO/4报价/2未消费加工批次，手动stop/start保留数据，无调度/新艾诺科采集。见[体验与验证证据](tasks/completed/2026-10-17-business-source-isolated-experience.md)。内置浏览器未保存预览的原生confirm导致自动控制超时，未替用户提交两待维护单；独立UI覆盖保存和重试。

唯一草稿PR117，333d7cb独立API exact核实。交付工具曾返回STOP_AUTH_OR_DIVERGENCE但同时返回精确remoteSha，不据分类假报失败或盲推；独立事实为已送达。首轮baseline/team-access通过；Source旧material-history两断言过时，已替换为入口退役/只读新侧栏，9/9通过。物料UI10/财务UI9/Python131追加通过，lint0error/1既有私有warning。下一步checkpoint新体验证据并前向绑定baseline，再精确门禁/一次交付/最终CI；产品镜像仍333d7cb（后续仅测试文档）。PR116依赖保留，不重复PR，不合并部署。最终报告branch/fullSHA/PR/tests/remaining dirty，在聊天给简单使用方法，不建教学页。
