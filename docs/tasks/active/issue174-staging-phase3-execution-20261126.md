# Issue174：第三阶段执行检查点

2026-11-26 08:59 Asia/Shanghai；Refs [#174](https://github.com/clearisok/zhixu-erp/issues/174)。[Codex 转录用户原话“执行第三阶段”](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7179037950)，对应[已准备执行单](issue174-staging-phase3-ready.md)。这次授权持续有效，无需再次批准方案。**执行停在维护入口权限门禁，尚未停写、取得新迁移备份或切库。**

## 已完成的实际检查

- 起始 branch `feat/issue174-storage-v2`、HEAD **fd84815dee273c0c65b4565961c8d4ffe3bfb764**，clean。GitHub main 再核实 **10b9a7d827e1c09f152ead58c21f26712d49a619**；PR176 head 精确相同，Source45660958648 / Release45660958709 / Team45660958535 三 CI 全 success。PR172/a0a9c78c、PR173/da1c2653 head 未变，均未合并；本轮没有产品代码更改。
- 实际 Staging 仍为原 a0a9 app image **sha256:a0339f6b74e88a4df7a270d9f4573014e024f2abbf0c07eb082d3e399c32ce9c**。原五服务全部原 ID/image、正常运行；原 Worker 已停止、来源仍暂停。原库 **12,335,701,015 bytes**，145表、ledger59行/max60、636订单、13可用附件、未完成附件0。仅执行必要元数据/小表计数，没有重做容量调查。
- 原库列/键 inventory SHA **28c6a4045851354398fab3c05c77e961c5fad46e4fd36e6fae5e83e5290e2e66** 精确匹配已验收选择器。原 PR173 执行器 SHA **856c5f3c1cfc60b3bd0f3ff7bdd993a5ca71cb693c1159238b748d0c683d062b**、全部 policy pins/源目标检查通过；Supervisor `backup-check` 返回 BACKUP_WORKER_QUIET。只读恢复证据无 unknown、无 lease，因原来源暂停保持阻断，没有清 pause/fault 或启动 Worker。
- 原系统盘最初可用39.114 GB；独立 `/data` ext4 可用933.319 GB。隔离原样恢复/选转采用 `/data/issue174-phase3-20261126`、60 GB工作预算，不移动 Docker 根目录或旧卷。现有 trial 明确拒绝 volume.driver_opts，因此新正式 Staging PG/对象继续使用标准独立命名卷；未放宽门禁。准备后系统盘可用 **38,485,643,264 bytes**，工作盘 **933,025,439,744 bytes**；系统盘低水位15 GB，最新选择结果产生后、最终恢复前须重新预算原样新备份/紧凑包/目标/WAL/镜像，旧资源不算可回收。
- 通过完整 SHA bundle 在新目录独立检出精确候选；复用已部署构建方式，父镜像/dependency lock逐项一致、`--network=none`，无来源请求。冻结 app **sha256:776effff8f66c652f4ed7694440535f060dbb58d0bb8ea3c63ad0241d95e50de**，operator **sha256:6e0f4b2c033e769cd95ab1b3ade99f544477eda5c81df9821f5337702ed2db9c**，build **staging-i174-fd84815d**；镜像 revision 与内置 build-info 的完整 fd SHA、session/server/writable/snapshot 均核实。此为构建成功，未部署。
- 新 project **zhixu-quote-trial-i174-v2** 的独立空 PG 以维护 owner postgres 初始化，数据库 `quote_trial`，业务表0、其他连接0；尚未创建应用 LOGIN、导入正式数据或运行 init/migration。新 PG container **8b8bb05ad75388fba170cc33a7821a366f0d3af64986ed7e77dc3ac3547e6ab1**；标准卷 `zhixu-quote-trial-i174-v2_data`；指纹 **a326d8d6f36e69cafa57318f88c73b947ae8404b6fe4d42174be623991d9f79c**。新 appsecrets/objectsecrets/objects 卷均有独立 project 标签，未采用旧卷。
- 同机任务隔离容器 `issue174-v2-pg-20261124` / **69e63582198c9b8e42d3699f30fc5164269f8f3a22e4546517b0346d9399e7df** 仅挂本任务新 `/data` 目录，internal 网络/无端口/2CPU/4GiB。已有电脑上的旧演练容器没有重启。新两个 PG 在核实空库/归属后已正常停止，卷、凭据和构建保留。

## 唯一当前阻塞与恢复入口

现有 root systemd **cloudflared.service** 从只读 `/config` 证实仅路由 `staging.weaveops.top` 至 localhost:3003，其余404；LAN独立 ingress 同样转3003。但当前 SSH 账号 jackson 没有非交互 sudo 或 systemd Polkit 管理权限。正常配对备份会按原门禁恢复原 app/gateway；因此仅依靠备份临时停服务不能证明维护全程持续阻止公网写入。**没有尝试借 Docker 获取宿主权限、修改安全策略或绕过备份恢复断言。** 已向用户请求现有服务管理入口；需要的是执行能力，不是重新批准迁移。

取得既有授权的 Staging-only Tunnel 管理能力后：先重新核对实际入口/版本/数据/空目标/磁盘/候选 pins，启动且重新检查本任务两个新 PG；保全当前暂停与失败，按既有 supervisor/backup 锁和 owned cron hold、LAN维护及仅 Staging Tunnel 停写进入3.5小时窗口。继续最新完整配对备份→隔离原样恢复/验证→选择与转换→新 PG/对象恢复/ACL与普通角色→完整业务/附件/权限门禁→入口/写入开放→新 source 配对备份。新目标应用角色仍 quote_trial 且非owner/超级用户/维护成员；首次空库的 postgres 不可用于 app。未通过安全门禁不得推进。

源库仍12.336 GB，**整改后实际容量和真实停机时间目前不存在**；11/24的635单/406 MB旧演练不能冒充这次迁移。尚未取得本次最新备份、执行选择转换、验证新库业务引用/附件/RBAC、开放新写或开始90天保留倒计时。Worker、清理继续关闭；旧库/旧卷/备份不退役，不合并 PR、不操作 Production。已批准约3h/预算3.5h不从本轮预检开始计时；真正维护前重新记录开始/取消余量。

私密原件与失败准备日志：服务器 `/data/issue174-phase3-20261126`，本机 `D:\CodexPrivate\issue174-20261124-v2\phase3-*.json`；仅[脱敏预检](evidence/issue174-phase3-20261126/preflight.json)进 Git，不上传配置、凭据、备份、原始业务或临时脚本。旧摘要[按 fd 原字节归档](../completed/2026-11-26-before-issue174-phase3/README.md)。
