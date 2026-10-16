# 恢复点：订单业务来源候选收口

2026-10-17 / main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。实际树ainuoke-live-readiness/zhixu-ainuoke-api，分支feat/order-business-source，从clean ac620305af04cf8f8d8ad5ec5f254a68a6ccdd04开始，当前修改均为本阶段。旧接力逐字保留[此处](tasks/completed/2026-10-17-before-business-source-handoff.md)。先读CURRENT_STATE、ORDER_BUSINESS_SOURCE与D144。

新业务规则已明确批准，无负责人/认领/转交/准备；合同先有艾诺科，加工保留独立入口。business-source采用不可变产品条件+商业版本，旧公开写API410，历史内部服务和数据保护测试保留。不要重新启用旧五套UI入口，也不要删除旧记录。当前107+83后端/兼容、6新UI通过；加工UI9/9、根898/898、基线94/94及main源码门禁均通过。冻结证据已前向绑定b3d71565，旧hash未改。

下一步checkpoint后绑定docs/release/baseline.json中decisions-selected-source-once的继任证据，运行完整root/基线/typecheck/lint/构建及新页面/加工页面。新隔离可编辑副本尚未创建；必须新volume/network/db与新合成资料，原两合同只读PG仅可dump读，不写。私有目录outputs/isolated-private-3a6aefbe-bcf9-4bbe-92a7-d3bd226a7cfe含凭据和业务原文，不打印manifest全文，不运行旧采集工具，不再读取Ainuoke。原62316不续期/不修改，拟新62326体验环境无调度、手动启停。新规则工程和演示分别记录。

远端新分支尚未交付；PR116原依赖保留，不重复创建。精确提交核实后创建唯一新草稿PR，不合并部署。网络按AGENTS有界协议。最终报告branch/fullSHA/PR/tests/remaining dirty，并在聊天给简单使用方法，不新建教学页面。
