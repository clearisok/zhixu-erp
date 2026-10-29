# 宁波三合同固定初始化：真实来源验收

2026-10-30（北京时间）。产品 main **562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94**，应用 **d0685f84853c73f89ba9843bff40bfdab148c30dcfcfddd19a79425d9b6226cb**；没有新产品代码、数据库迁移、PR合并、上传或 CI。前置[独立部署、恢复及公网验收](2026-10-30-ningbo-isolated-staging-deployment.md)保留原范围和时点。

## 授权与实际目标

用户明确回复“批准宁波固定初始化（推荐）”，允许本宁波新库三合同接纳、限定来源目标启用及单次有限采集。原审阅清单 SHA256 **dd7dc76e6066eb15dcd2a1e06e5048117fdcb2e7791a1949b96394d1cf8439bb**，新批准 request **5f0e3edc-d173-4891-9aaa-038c185a3b0e**。上限7登录、410报表、417 HTTP、45分钟；零重试、失败停止，不开持续调度，不采第三合同物料或货款，不填造生产、价格或关账。

目标仍为 `/home/jackson/weaveops-staging-preview`、project `zhixu-quote-trial-staging-562fbf07`、DB fingerprint **88b5ba705e1fbbb6a1b07755754249c4a37577473214c9a5b2874e61b5eac1ae**、staging.admin publicId **2f43e2c4-4fc5-4224-8214-ccfec22584d7**。旧数据库未查询，新库未复制本机SO UUID或旧账号。

同main操作者镜像 **sha256:100e922b62e04019da54884ef94e02af11dab594ae4f6470ea5855bc84f14307** 离线传入并核实。运行前核对3331个Git原件、51迁移/121表、新数据库/操作者身份、已有合成报价和附件摘要、原财务与出货筛选证明。历史证明只用于核验，原时点及原hash保留，没有作为新采集快照发布。

应用只追加payment/garment snapshot两个reader标志，完整Compose模型差异验证只有这两项；有效配置改为 **`runtime/trial.source.conf`**，原trial.conf保留。没有凭据写入应用、容器环境或Git；私密进程通过stdin及短命tmpfs使用既有本机文件。预检容器没有外部网络，PREFLIGHT_PASS且真实Source请求0后才启动采集窗口。

## 实际完成

窗口 **2026-10-30 00:25:47.294—00:36:19.268 +08:00**，约10分32秒；UTC原件为2026-10-29T16:25:47.294Z—16:36:19.268Z。原两合同绑定→三轮物料→两合同货款→第三合同接纳→第三合同出货，严格按批准顺序执行。第三合同加入后没有再调用两合同物料采集。

| 合同 / 正式SO | 数量 / 颜色 | 本次物料 | 本次6086941 | 本次6086979 |
| --- | --- | --- | --- | --- |
| PI2608-257 / SO-00000001 | 13,500件 / 1色 | 3份历史、当前9项 | 18行、generation1 | 未启用/未采集 |
| PI2609-039 / SO-00000002 | 6,000件 / 1色 | 3份历史、当前31项 | 15行、generation1 | 未启用/未采集 |
| PI2606-008 / SO-00000003 | 9,250件 / 6色 | 未采集 | 未启用/未采集 | 16行、generation1、全部匹配颜色 |

新SO UUID依次为 **8ae5851b-ed07-4f6c-acbf-d18fbcb4daad**、**3bde5f34-17c0-45c5-916e-0cd738f8455e**、**a79f7730-a27b-4d49-9904-e18f62d83e6b**。8个颜色均可读已保存尺码证据，不根据数量推造尺码。

物料发布时点为UTC16:25:55.751、16:31:00.384、16:36:04.937，间隔均超过5分钟；发布时最早页龄分别2441、2422、2387毫秒。成功保存3个source runs、6个逐单快照。五次selected调用各1登录/26报表/27HTTP，均0网络重试、0认证续期。货款独立调用1次，原worker上限1登录/8报表/9HTTP；该调用公共回执未保留实际传输计数，**不冒称精确实耗**。出货实际1登录/2报表/3HTTP。组合保守上限7登录/140报表/147HTTP，低于授权上限；未使用额度不作为后续重采许可。

出货request **2161c06e-36e2-41e4-8a0e-b7112891982f**，publication **9f52e34f-b253-4117-a226-b042e97a6ac5**；原Num/outdate口径及两遍完整首页校验保持。16是明细行数，不是出货件数，也不把合同9250件当出货数量。原两SO身份/源绑定、全部quote_*表和附件保持。运行容器 **zhixu-ningbo-source-7247e4beea-run** 以exit0终止，没有后台循环或持续调度。

## 公网与保护核对

UTC **2026-10-29T16:37:00.597Z**，外部正式HTTPS客户端通过 `https://staging.weaveops.top` 验证精确main、新会话、三单详情及颜色尺码、交期、月份展示与生产读取。原两单物料ready、三份历史可打开；货款observed且bankPaymentStatus=not_inferred；第三单成衣observed/fresh、16行。第三单当前物料API返回404/order_not_available，因为没有本次物料快照，历史列表0；**不是不存在SO、物料零数量或已完成物料接入**。其货款not_connected，原两单出货not_connected，符合限定采集范围。合成报价快照hash与原部署验收一致。

额外只读SQL保护核对的包装查询先因错误地从SO主表读取镜像字段而失败；修正join后又因json_agg多行输出的逐行解析失败。两次均为只读、没有Source请求或写入；改用jsonb单行输出后完整核对通过，原失败回执保留。不得把这些失败描述成真实采集重试或已通过测试。

最终核实121表，生产排单/完成、订单商业版本及明细、财务期间/分配/月份财务连接均与窗口前相同；没有虚构上述业务。旧5容器ID/镜像/状态/启动时间不变、3旧卷/6旧网络保留。没有删除或重置数据、改真实账号、关闭证书验证、改旧3000/3002或公网路由。

采集后复用原精确目标Backup工具另存新库备份 **947996字节**，SHA256 **3993468f9f95eff759b810f1a0bab8163105875790119f63b180d1b6dca2ab5a**，目标fingerprint与上文一致。私密文件为 `D:/zhixu-server-convergence/ningbo-target-562fbf07-f3f9f290/source-initialization-backup-tools/backups/zhixu-20261029T163742Z-ae4e15c4.dump`；原对象备份对应的唯一附件未改变。**没有再恢复本次新dump**，不将原空系统恢复结果冒称本次真实Source数据恢复通过。

## 接力与验收边界

当前安全回执在ignored **outputs/ningbo-approved-deployment/source-window/**：manifest、preflight-result、run-result、public-source-readback、final-audit、backup-result。原件/进度/历史证明保存在宁波owner-only卷 **zhixu-ningbo-source-7247e4beea-reports** 的 `/tools/source/outputs/private`；没有把原财务内容、密码、连接串或Token写入本文/Git。ignored包装脚本的边界与hash保存在manifest/后继evidence-index；不得再次执行prepare/run或换请求重采。

本阶段实际执行包装脚本语法检查、无外网预检、一次获准真实窗口、外部公网只读读回、121表/旧资产保护核对、新dump目标/hash核对及精确main源码守卫，最终均通过。源码守卫12页/68能力/0 UI文件变化；它不代替前述实际运行证明。未重跑此前完整测试、浏览器套件、恢复套件或CI；没有登录后人工界面验收通过的声明。

本阶段有限初始化已完成。10分钟时效保持，过期不自动刷新；物料历史继续可查，出货观察按原时点标记，货款过期后隐藏旧明细。新任何真实采集、合同范围或调度仍需具体批准。生产、报价采用、USD加工价、调月和财务确认/锁定有工程与合成验收，不因本次来源初始化就被认作真实执行或完整财务闭环。登录后人工页面与业务核对仍待用户；完整Goal Gate0–8/R未结束。体验登录信息在本机私密staging-login.txt，未输出密码。
