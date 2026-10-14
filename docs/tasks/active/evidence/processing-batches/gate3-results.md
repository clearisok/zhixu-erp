# Gate3 加工批次：本地工程证据

核实2026-10-14；最近核实main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5；分支feat/processing-order-batches，依赖本地Gate2 2c6c2315d4b295dba2c6f73f651255f775790b99及Gate1 def98f275c2ef61712008891ab1c60d308981bb7。UI/服务源码检查点cd4410f092d6186dee3f71269ac444701213622e；后续仅增加验收测试/文档。本文先提交后绑定冻结SHA，不自引用未来提交。

## 已确认实现

0016加工批次、确认历史、唯一消费和请求回执。登记/确认不分配SO，消费按每批独立事务同时提交SO、加工身份、不可变订单商业版本、消费、审计和回执。批次锁、唯一键、actor/request/item哈希防止两个入口及网络重试重复创建。同报价/相同PO多个真实批次合法；相似下单只提醒。取消与消费争抢只有一个终态；晚期审计故障完整回滚，无孤立SO。

精确Quote/Revision/PriceVersion确认来源重新校验；零工价合法，缺工价/币种、软删除、类型改变、PV移除、来源指纹漂移均阻断未消费批次。已消费批次不依赖来源仍存在，返回原SO及原商业快照。两个新权限分别管理批次与消费；基础查看权限、fresh DB授权及撤权后重试保护均生效。

Server订单中心导入/报价中心推送共用Foundation弹窗与服务；搜索、分页、预览、确认、跨页多选、部分成功、仅失败项重试、未知响应原请求重试、带原因取消、历史SO查看均有合成验证。参考订单按正式查询选择，只记录血统，不复制执行数据。加工订单无伪艾诺科合同/来源；业务客户/款号/数量/日期来自可信消费快照。友好版本名称与精确身份追溯分别展示。

## 验收

- 加工领域/SQL/HTTP/服务35/35 PASS，outputs/gate3-terminal-source-tests.log。覆盖并发防重、不同真实批次、部分成功、取消终态、晚期故障回滚、零/未知、精确版本删除/类型变化、分权及四种基础/消费撤权、空页继续、历史分页。
- Chromium9/9 PASS，outputs/gate3-pagination-ui-followup.log。生产构建、真实合成session、双入口、失联重试、取消、部分失败恢复、参考原单、21批次跨页选首尾、390px及无权限入口。
- 最终源码824/824 PASS，outputs/gate3-final-source.log；typecheck、完整lint、Server编译及显式Server构建PASS。
- 最终PostgreSQL261/261 PASS，outputs/gate3-final-postgres.log；本次完整复跑无跳过。
- 基线回归及精确提交检查在冻结证据提交后执行并追加独立复审结果；前一阶段78/78不冒称最终运行。

历次测试失败及修复均保留于加工任务：旧共享CCT夹具改为明确采用版本，旧权限数63→65，订单文案契约更新，浏览器等待可操作状态及历史分页目标定位。没有删掉授权/事务断言或改产品放宽规则。

## 状态边界

implemented=yes（Gate3本地范围）；merged=false；isolatedTest=passed-historical；humanAcceptance=not-run；sourceActivation=not-applicable；18443/18444=not-deployed。历史环境SHA/image沿用旧记录，未重新探测。GitHub传输NETWORK_DEGRADED，未推送/新建PR/远端CI，不能称远端交付PASS。

只用随机tmpfs PostgreSQL、合成账号/数据及临时浏览器。没有真实账号/数据库/Source/部署变更。应用回退须关闭新命令并保留身份与采用历史；不承诺旧镜像兼容新schema，不执行真实回填。候选默认只显示当前可用confirmed批次，服务按扫描页返回hasMore，来源失效可导致空页；并发新登记会影响offset分页，消费唯一约束仍兜底，不宣称跨页查询为不可变快照。

完整Server生产/关账与历史归一不是本Gate实现。G4/G5继续独立推进；真实历史归一、迁移和部署须另行授权。更新时机：后续修复、验收、基线或远端变化新增证据版本，不覆盖已冻结记录。
