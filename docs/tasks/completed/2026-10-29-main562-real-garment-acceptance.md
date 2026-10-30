# main 562fbf07、本机成衣出货与宁波准备（2026-10-29）

## 已验证事实

用户明确批准仅合并 #134，并新增一次 PI2606-008 固定出货采集。#134 以 merge commit 合入 main **562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94**，双父 e11b3c3c / 35e24489、树 b249ffe08c4246a31bae6b83f99ffd488f17dbbf 精确核对，三项 PR CI 均为 head35e 的首次成功运行，未手工重跑。原分支/历史保留，没有合并其他 PR。

实际 main 从3331个原始 Git blobs冻结，无源码覆盖。应用 sha256:d0685f84853c73f89ba9843bff40bfdab148c30dcfcfddd19a79425d9b6226cb；源码工具 sha256:100e922b62e04019da54884ef94e02af11dab594ae4f6470ea5855bc84f14307，干净 checkout、非 root、同 lock 与帮助入口通过，51份SQL与前件一致，无迁移。本机 https://localhost:54315 更新并就绪；三张SO、来源、账号角色/密码及业务摘要保持，保护角色仅启动时间戳/用户序列有原有技术变化。

本片构建先误沿用已知不稳定的默认APK通道，编译完成后在包步骤停滞；仅停止该自有会话，保留日志，复用已验证USTC构建参数成功，没有修改主机代理/TLS/源码或重复默认通道。

## 恢复证据的精确范围

新镜像原Node套件9项：**7通过、0断言失败、2因600秒父级时限取消**，原exit1/log/hash完整保留，不能写成9/9。随后只从原有两个合成 project 和原备份收口最后独立恢复阶段，没有重跑前6阶段或重新种业务数据。现场发现Restore已经执行，因此没有再次Restore；批量只读核对全部121张表/序列精确一致、原身份/密码以及冻结/执行方触发器定义一致。附件篡改、可写挂载、冲突对象负例及默认/显式只读恢复通过；17条报价、生产、关账HTTPS读回与附件字节一致。补充结果为 RETAINED_INDEPENDENT_RECOVERY_ACCEPTANCE_PASS，不改写原取消记录。原合成卷/目录保留并停止，未删除旧资产。

本机更新前另有三单数据库在线备份：934266字节，SHA256 6733006cb0535854bc415e53fbc1eba8f9c56d5f44dc2215b58d6eddeb4a036e，只验证归档和hash、未称该dump已独立恢复。实际更新另做配套DB/对象维护备份，保留于 pr134-main-upgrade-e2b7cc60-cefa-4fdc-be86-2395e321e45e。不要混用不同备份的证明范围。

## 本次唯一真实采集

固定SO 0535a7a6-0ad4-4ed3-99c6-1ee1dac5e60f / PI2606-008 / D1933 / 6色9250件；原两合同PI2608-257（13500）和PI2609-039（6000）保留。target版本1及原过滤证明不变，原checkedAt为2026-10-29T05:43:11.830Z。没有重读合同/颜色、apply-target或延长旧时效。

- 请求 69488dec-ddc9-4d45-96f6-08d8f6c66272，实际**1登录+2报表=3HTTP**，无重试/第二页；批准上限100行/页、4MiB/响应、报表8MiB、180秒。
- 两遍实际观察2026-10-29T09:59:41.392Z–09:59:41.779Z，均成对0/0且完整16行，实际1/100请求体hash6ac51819bbbc8202a675801b9b97b64b62cad4fe8b9c6b2a95132ae7bdc7593c、序号1/2保留；原文hash均2a6f38c17f5567c01cd1d6b0f3899c24bcb5ccb268ca722ed68c415c358d6ee9。与旧样本字节一致不意味着本次没有真实请求。
- 新发布 acb344b3-120b-4e5d-a923-ab70db72305d，generation1、snapshotId 5b57d24740877245656e6d4c324a8a714c7c733ae2df24ad9d855da51086abd1；16行全部匹配6个订单颜色，业务日期outdate均2026-10-11。合同9250件不是对这16行出货数量的汇总，未将出货认作生产完成或收入。
- 原失败请求 d6d2ace1-4c19-4dc5-bbf5-8bc1d7a584f6 仍completed/not_published；其他表除本次采集/快照/颜色匹配/head/审计外保持。未采物料/货款、未写生产/商业/关账、没有调度。
- 页面最初503是本机成衣快照读取未开启；仅追加只读snapshot配置并重建自有app后，当前/历史/指定版本均HTTPS200，真实响应通过严格客户端解析，createTime未泄露。600000ms时效未延长；此次快照在10:09:41.392Z后应显示陈旧/历史，不能自动重采刷新。

运维包装独立复审提出的P2已修：进程非0但durable结果已published时保留已发布事实并明确异常，不能误报未发布或换请求重试。实际采集进程0、durable completed/published，预检0Source/0写入。最终复审回执与界面人工接受分别记录，不借工程结果冒称人工通过。

## 保存位置与未完成项

完整Goal Gate0–8/R仍继续，非本片全部完成。安全回执在当前工作树 outputs/pr134-* 与 outputs/c1-repaired-collection；私密原文仅受保护卷 zhixu-c1-repaired-8e7f0e348b-reports，凭据/DSN仅stdin/tmpfs，未入Git。发布包 D:/zhixu-server-convergence/release-main-562fbf07-7e889aac 包含应用241654272字节、同版源码工具813012480字节与原始bundle，不含本机凭据、原始来源报表或数据库dump。包未传宁波。

90个原有其他容器的ID/镜像/启动时间/状态不变，原212卷/41网络全保留。本机原两单物料四流和6086941仍为已批准旧窗口的历史来源；C1未采物料/货款，没有实际报价采用、生产或关账业务数据，不把合成完整链路冒充真实业务发生。

宁波只读复核：旧staging7cd43b61、3002健康；3000仍监听，3003空闲；/home/jackson/weaveops-staging-preview未存在、父目录可写、约207GB可用。没有远端写入/部署。全新宁波私密输入仅本机准备并用无网络Linux容器校验，计划新project zhixu-quote-trial-staging-562fbf07、独立空库/四卷、新staging.admin，旧站/账号/数据库不复制。公网切换仍需具体部署批准、原Tunnel路由保全和源站TLS信任核对；公共cookie/Host/Origin/附件与用户接受尚未完成。宁波真实Source初始化需另列新目标固定范围，不自动复用本机采集许可。

本片为运维证据文档checkpoint，产品候选仍为main562fbf07；不因文档提交重复构建、上传或触发付费CI。原阶段证据完整保留于main e11/562 Git blobs及各日期文档。

宁波镜像补充只读事实：本机postgres:16-alpine为16.14/sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229；宁波现有同标签为16.15/sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea，均Linux/amd64。不得改写共享标签来追成本机摘要。部署审批方案选择保留宁波现有16.15，仅在新项目校验精确ID，并在新空库进行现场初始化/恢复/接口验证后才能公网切换。现有数据库未查询或写入。Docker-over-SSH只读版本/镜像核对可用，后续可由进程级远端Docker连接复用既有精确目标备份工具，无需假定Ubuntu已安装PowerShell。具体许可见outputs/pr134-ningbo-deployment-review.json；该文件本身不授予部署。
