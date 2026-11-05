# PR140首次CI、兼容修复与体验站实际范围

2026-11-04；输入feat/ainuoke-full-catalog-followup、32100b27d3b14dcbfef5ce6a83ace6c3d4ce5836，工作树干净。用户明确允许创建唯一草稿PR并检查CI，同时询问全部艾诺科订单是否引入及staging是否部署。没有新增来源采集或部署许可。

## 实际交付与CI

API再次核实main cb5cc29baa49ed7115fdb6c9506b6a80356936ea、head32100b27；按head查询无既有PR后创建[140](https://github.com/clearisok/zhixu-erp/pull/140)。元数据核实draft=true、mergeable=true；仅一次opened触发三个workflow，没有workflow_dispatch、rerun或新push。

- [Release baseline 41843109476](https://github.com/clearisok/zhixu-erp/actions/runs/41843109476)：success。
- [First team access 41843109177](https://github.com/clearisok/zhixu-erp/actions/runs/41843109177)：success。
- [Ainuoke server source 41843109164](https://github.com/clearisok/zhixu-erp/actions/runs/41843109164)：failure。编译/迁移来源步骤中test:material-arrivals的旧升级快照与失败模拟不兼容，后续步骤未执行，不能冒称整个来源CI通过。

Git先前只push一次且远端精确送达，但仍退出1/STOP_AUTH_OR_DIVERGENCE。具体原文未保留，旧代理定位不能解释该退出。当前用户例外覆盖PR元数据和首次CI，未执行第二次上传、更换认证、合并或部署。

## 本地最小兼容修复

首次失败的material-arrivals-upgrade在0038→当前升级后将新增catalog_run_id:null也当旧行改写；另一测试只直接改profile全局错误，新模型改为per-order head，未实际模拟新捕获失败。生产reader/service及0053–0056未发现需因此更改的业务行为。

修复只涉及测试：

1. legacy-row-snapshot-fixture在升级前读取并冻结每张显式旧表的真实列集合，后续用显式原列比较全部原值/行数。不存在原列会SQL拒绝；没有忽略表/旧行/旧字段，没有从生产runner推导预期迁移清单。新字段语义独立断言；到仓新增目录指针必须NULL，新owner空表及精确迁移文件断言不变。
2. 7份升级验收统一使用该快照，避免之后的同类误判。新增合成负向控制：新增列允许，旧值变化、增删行均检出，原列丢失拒绝，非法SQL标识符在查询前拒绝。
3. 到仓失败场景调用既有captureSource的合成失败路径，再检查per-order失败码、旧成功run不变、计划与原回执保留；没有简单把source_failed期望改为ready。

本地实际结果：首次2文件23项全部通过；统一快照后7份升级文件18项全部通过（其中3项与首次重叠，不能合计成41项独立验收）；最终类型与9路径lint通过。仅随机tmpfs一次性PostgreSQL、合成数据及loopback；复用已有postgres:16-alpine，不pull镜像/装依赖。业务代码/SQL/前端未变，原构建、浏览器、Python与182发布回归按同代码复用；最终文档提交后另跑精确源码守卫。不把本地后继通过写为远端32100b27通过。

## 体验站与订单范围

本次只读公网/build-info.json为200：source f21c96c1899126028ba9a272727ad8d564ccf185、build server-preview-f21c96c1-e4874825be、session/server/snapshot。通过宁波project zhixu-quote-trial-staging-562fbf07唯一数据库容器、BEGIN READ ONLY与5秒SQL限时核实3正式SO、2报价、121公有表；未启动/停止服务、修改业务或请求艾诺科来源。

因此没有全量引入体验站：当前账号可见608张合同，550详情成功/5失败/53排队仅在隔离覆盖库，不自动生成550正式SO。staging仍旧版，未上线新目录、分档及有限恢复。后续升级须保留长期业务并重新绑定137表备份策略、完成配对和异机恢复；不套用旧121表PASS或重建库。

用户手动登录原网页成功，IAB只读确认首页/我的应用且无登录按钮。之前一次采集固定恢复仍为1登录/0报表明确拒绝并关闭，不能用剩余额度重试；两端凭据一致但拒绝原因未知。本轮采集器新登录/报表0，未更改cookie、凭据或isCoverLogin。

[此前状态及接力](../completed/2026-11-04-before-pr140-ci-fix/)已逐文件字节核实归档，原失败/日期/哈希/限制保留。新本地修复等待有界交付，PR保持草稿；真实来源诊断和宁波升级分别验收，不把这些工作混为一个完成状态。
