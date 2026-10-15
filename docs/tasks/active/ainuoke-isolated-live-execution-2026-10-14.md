# 四单真实隔离演示执行

2026-10-14；main基线064e3afaf7d08b3cb62907d4402f97d9c292f1e5；当前分支feat/ainuoke-anomaly-evidence，起点c78aa6b27f00cb22516c59ab5f1061d3d18b6233 clean。用户已对上一轮明确列出的4单、新独立数据库、loopback62310及两轮真实刷新回复“确认”。此授权不包括旧环境、长期scheduler、真实账号修改、宁波/18443/18444或合并。

本阶段复用现有Dockerfile.server构建候选、现有迁移/权限/绑定/采集/Projection及UI。增加只用于本机受保护只读挂载的isolated-source-demo-entry.mjs运维入口：manifest锁定代码、项目、数据库、选集、授权轮数；新库必须无业务表且无ownership才能初始化；之后每次检查ownership、数据库身份和精确构建。initialize仅新空库建立6演示角色，不seed订单/报价。preview/bind/capture输入通过stdin，凭据不出现在argv/env/日志；capture最多2轮、必须精确4单，全部走既有服务。serve不读凭据、不采集、不调度；D118只从受保护且目标绑定的显式确认包注入。

真实合同、目标manifest中的随机密码、原始快照和读取回执仅存本机受保护Git忽略目录。构建上下文按.dockerignore排除outputs/.env/秘密，不复制用户凭据入镜像。容器创建与每次操作前按本机Docker endpoint、label、容器/镜像ID、网络、volume和只读挂载核对。独立DB不发布端口，应用只127.0.0.1；不接管重名资源。

当前记录为执行前工程checkpoint；初始化/预览/绑定/刷新/页面结果在后续执行证据前向记录，不能把授权当成功。回退停止本任务独立进程、保留volume和私有回执，不自动清除或回写来源。更新时机：每个实际执行Gate与代码/目标变化。
