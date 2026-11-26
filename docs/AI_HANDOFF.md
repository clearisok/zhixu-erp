# 接力：Issue174窗口已安全取消，原Staging恢复开放

2026-11-26 13:43北京时间；branch feat/issue174-storage-v2，本Gate baseline **84c1e08df8760e6c1bb6ce997951b6b1faecdc3d clean**，应用候选仍 **fd84815dee273c0c65b4565961c8d4ffe3bfb764**，main **10b9a7d827e1c09f152ead58c21f26712d49a619**。PR176 Draft/未合并；PR172a0a9、PR173da1c精确保全。**第三阶段未完成切库，不能写PASS/Done。** [实际执行日志](tasks/active/issue174-staging-phase3-execution-20261126.md)、[取消与保全证据](tasks/active/evidence/issue174-phase3-20261126/cancelled-window.json)、[选择门禁Issue回执](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7182284590)。

原窗口10:37:07–14:07:07，预留13:37取消点；原恢复工具于12:09:48完成，但后续时钟核对已13:41，后续必要门禁未完成。12:09:48至13:41之间无后续角色/附件/应用验收或切换动作，间隔原因未验证，不能把它算成数据库恢复执行时间，也不能把用户“继续”自动解释为延长固定窗口。按原批准执行单“超时不擅自延长”取消；**13:42:11恢复原Staging**，维护共3小时5分3.56秒，未开放新候选写入。下一轮时间已请求用户确认，其他v2范围授权持续有效；没有批准新窗口前不要重新停站。

当前实际线上旧a0a9 app/source **a0a9c78c6cccbadf5e635dbb60169f7f87944644**，原五服务同ID/image、原policy/pins通过，公网build与LAN健康独立确认，数据库12,335,701,015bytes。cloudflared已用专项sudo start恢复，原LAN配置完整还原，127回环预览移除，本机owned SSH转发已精确PID/start/forward核实后停止；未知旧SSH进程未碰。owned每日备份仍原30 19 UTC（北京时间03:30），只加入既有reviewed-paused-Worker备份reason；分钟Worker继续hold，其余cron字节不变。原Supervisor backup-check再次BACKUP_WORKER_QUIET，没有清pause/fault。**Worker停止、cleanup=false**，Production/其他Staging未操作。

已完成且保留：本次最新原始配对 **20261126T023837Z-14573686**，manifest **85bc4166743272cbbbcdca71379ef2c9ebeeab9e782aec1113bb4a95fae9dd25**，145表/13对象/58文件/3,843,034,120bytes，全hash/TOC+完整decode/首末全行摘要/cleanup与服务恢复证明PASS，历史failure未改。/data第二物理磁盘副本全hash通过，仍同机不是offhost；90天从未来正式迁移验收成功起，取消不启动倒计时。原样隔离恢复1191.213秒（含副本工作），首次仅两个独立序列owner不同；只修隔离owner至安全NOLOGIN角色，值/旧库/断言不改，保留失败，随后原verifier全量重跑498.972秒PASS。

隔离选择/转换/全部旧列及必要来源证据验证总660.936秒：145旧表/5序列/FK/临时角色移除/清理关闭均PASS。636订单、8报价/8修订、13附件及引用、3员工账号、223,220操作日志完整保留；12张技术表获批部分旧行未迁入，旧库不删。新history epoch2026-11-26T03:51:33.162Z，**尚非入口T或真实同步**。

紧凑包63,878,715bytes/完整decode/fullSHA **00f22f8a1a034b7ae16ef5d7642ddb41f5044bb65e803aa0a8ae42fff9cce1c5**，本机私密frozen restore ops/backups与服务器均保留。原Restore-Zhixu通过process DOCKER_HOST=ssh://weaveops对精确新project **zhixu-quote-trial-i174-v2**/container8b8bb05a…/data卷/指纹 **a326d8d6f36e69cafa57318f88c73b947ae8404b6fe4d42174be623991d9f79c** 恢复完成，工具包装执行346.781秒（04:04:01至04:09:48Z，包含SSH复制/门禁，不含前置空库检查）。候选DB **408,263,703bytes/147表/636单**；普通quote_trial角色仍不存在，四maintenance owner/ACL尚未恢复，**绝不能启动候选app或称实际权限/应用验收通过**。

新任务PG与isolated PG **均已按原ID停止并保留**，所有卷/原样库/选择库/凭据/日志/失败/备份都不删。服务器私密根/data/issue174-phase3-20261126，本机D:/CodexPrivate/issue174-20261124-v2。window-terminal.json=CANCELLED_BEFORE_NEW_WRITES_OLD_STAGING_REOPENED、cancel-verification.json正向通过；window.json的newWritesOpened=false。不要重跑任何有intent的旧phase或重新执行cancel脚本。新候选按未完成对待，所有未执行的final-integrity/objects/start/browser/new-policy/new-source-backup/open-writers脚本仅是私密准备材料，不能当结果。

下次窗口必须重新确认最新源/目标/空间与保全；**原库已开放，旧636单备份/选择清单不能直接覆盖今后新增业务**，要重新取得最新一致配对和新证明，保留已有副本/候选。固定CLI白名单不改；有旧DB/intent时先明确隔离身份与新资源/旧副本归档，不盲目覆盖。后续仍需owner/ACL和普通角色、147表/5序列等价、source实际物理指纹重绑、独立对象恢复、正常TLS实际UI/API/RBAC/附件、新source完整备份全部通过才开放新写；之后禁止盲回旧库。不得借本次取消扩大开发范围、开启Worker/清理、退役资源、合并PR或部署Production。

182发布回归已完整PASS，产品fd三CI成功；1033308e发布守卫PASS，84c1e08d送达验证PASS。取消checkpoint **2ee960e37c62f222faf12c86e9410d300436ef57** 的同main基线源码/证据守卫PASS（13页/68能力/40UI路径/errors[]）且DELIVERED_VERIFIED；后续仅追加结果元数据，不改产品/冻结输入，不能冒称新文档HEAD三CI全成功。离散磁盘采样含最后人工点最大净变化上界22,286,835,712bytes，系统盘最低33,799,770,112bytes；04:03后有采样缺口，不是连续峰值。自然两轮同步/24小时增长/新source备份、实际切换均未完成。

取消已回链 https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7183880418 。下一维护时间仍等待用户回复；不得因时钟已过原窗口就自行开新窗口。最后发布结果以PR176/Issue最新回执为准，branch工作区不得纳入私密dump/脚本/凭据。
