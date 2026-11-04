E5最新停止点：coverage进程69589已结束，550成功/5登录拒绝/53排队；96登录3472报表、0未知，最后仅1登录0报表299ms。按SDK可知data.isOk=false，原因不能细分；已向用户询问网页登录情况，禁止再真实登录/刷新或自动解除暂停。原100指针和规范化成功时间独立只读比对全一致，控制disabled+invalid_credential。新私密事件把显式登录拒绝标auth_error（正常协议不变），Windows171过；主机监管5测试过，尚未安装启用。应用42首次runtime失败EACCES（COPY700/600配合cap-drop导致），需源码只读权限重建；旧容器日志保留。下一步只做离线新候选/禁用态监管烟测、交付收口，不再Ainuoke读取。

E4最新：固定5单两时点全过（7登录212报表，0失败），原sample进程已结束。应用镜像42e18da526ec82bcefc2cdba7531c05595274b4a84c5fbc0a9121604bffa749b离线构建通过、未启动或部署。准备coverage action：全新副本仅补原508，保留100旧成功；150登录/12000报表/60分钟，连续3公共失败停。不要重跑sample或旧campaign；新scope见任务E4，后继coverage-review/progress.json为最新。下文sample正在运行已成为历史时点。

# 接力：新恢复候选，固定样本正在分时验证

2026-11-04，分支feat/ainuoke-full-catalog-followup；main本轮API重新核实cb5cc29baa49ed7115fdb6c9506b6a80356936ea。E1 a3f07bfe共享存储，E2候选1c93fe4e0e74d3948a6cfb6d4267c70e70938504。先读[任务](tasks/active/ainuoke-sync-resilience-2026-11-04.md)、D180、来源feature与CURRENT_STATE。[输入接力全文](tasks/completed/2026-11-04-before-sync-resilience/AI_HANDOFF.md)保留老测量和所有失败，不能把旧“已结束”或未刷新main当作本段当前状态。

## 正在运行，不要重启

exec session93881：仅宁波/home/jackson/weaveops-sync-resilience-20261104/stability-review，progress.json/summary.json/attempts.jsonl/capture-*.json。固定5单私密scope，SHA256=1618bd35d85accdb28e38d69238bf5bcfd5836d16975dc91158ff370d49b1fa9；29登录/2200报表/40分钟最多，单capture0网络重试。第一轮5成功（2登录67报表含目录），第二轮10:36:32.777Z开始；中间10分钟不查询。只读进度即可，勿重复sample动作或旧campaign。原始来源只在受保护目录；绝不cat collector.json/完整环境。旧worker必须保持PAUSED，正式库和账号未改。

Linux操作者sha256:fffc7640e2c33870a9c164aafd81eeb5dd8645e5d41945552633d417f2987c1f，代码1c93。工具resilience_ops.py（避免operator.py遮蔽标准库），COPY必须--chown=1000:1000；初次封装/冷PG就绪失败均在真实查询前，失败日志保留。storage-review已完成：新独立catalog_storage_resilience_20261104仅探针表，旧247观察/248目录不改；95,395,840B→3,252,224B，96.59%，所有证据精确还原。该数据库不是当前业务或新采集账本。

工程：类型/lint、Server/前端构建通过；82初轮80过/旧迁移清单及父2失败，修复后16过；30核心29过/目录smallint1失败，修复后9项全过；7Chromium最终全过（立即重试pending保护已修），1440/390实看。Python未变170历史结果复用。原182发布回归不重复，最终冻结/精确守卫后置。无新push/PR/CI，API main成功不等同Git可靠。

## 后续顺序

固定样本全过后，在新的隔离副本中续作608首轮，保留原full库100成功及回执，余503排队+5失败另行新请求，不从零重采。必须先冻结实际集合、预算、单worker/回退及退出条件；未知/认证/证书停止。之后才考虑新应用、服务替换与分档启用；先备份恢复，保留长期报价/用户/附件/卷，03:20–03:50不采集。正式替换依赖精确远端交付/必要CI，不能因镜像构建或一次样本成功就冒称已上线。不自动合并main。
