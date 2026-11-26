# 当前状态：Issue174 第三阶段已授权，停在维护入口权限门禁

2026-11-26；branch **feat/issue174-storage-v2**，工程候选 **fd84815dee273c0c65b4565961c8d4ffe3bfb764**，main **10b9a7d827e1c09f152ead58c21f26712d49a619** 本轮 GitHub 再核实。[PR176](https://github.com/clearisok/zhixu-erp/pull/176) 候选三 CI 全 success；[文档PR175](https://github.com/clearisok/zhixu-erp/pull/175)保留。PR172/a0a9、PR173/da1c head未变且均为候选祖先，本轮产品代码零改动。

用户在当前聊天明确“执行第三阶段”，已[转录到Issue174](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7179037950)。沿用[执行单](tasks/active/issue174-staging-phase3-ready.md)，不再等待方案批准。**仍未进入停写窗口或切库**；[实际检查点与恢复步骤](tasks/active/issue174-staging-phase3-execution-20261126.md)是本轮恢复入口。

实际旧 Staging 仍 a0a9 / a0339f6b…，原五服务 ID/image 均未变、正常运行；Worker停止/来源暂停，无 unknown/lease。原库12,335,701,015 bytes、145表/max0060、636订单/13附件/无未完成上传；schema inventory、原PR173执行器和policy pins、受审 backup-check 全通过。没有重做容量调查、改pause/fault或取得新的迁移备份。

候选 app **sha256:776effff8f66c652f4ed7694440535f060dbb58d0bb8ea3c63ad0241d95e50de**，operator **sha256:6e0f4b2c033e769cd95ab1b3ade99f544477eda5c81df9821f5337702ed2db9c**，build staging-i174-fd84815d；精确来源/build-info及原依赖锁核实，离线构建成功，未部署。新project zhixu-quote-trial-i174-v2 独立 PG空库0表/0客户连接，维护owner postgres、无app LOGIN；同机internal隔离PG只挂新 /data 目录。两个新PG已正常停止，卷/私密输入保留。

资源：隔离选转放 /data（约933GB可用，60GB预算），最终目标按原trial门禁保留标准命名卷，不采用被拒绝的driver_opts。准备后系统盘约38.49GB可用，15GB低水位；恢复前须按最新选择结果复算目标/WAL/新备份预算，旧资源不能回收。没有移动Docker根目录或删除旧卷。

**当前阻塞**：仅供Staging的公网 cloudflared.service 属root，现有SSH账号没有非交互sudo/Polkit服务管理权限。正常备份会恢复服务，必须另有完整窗口的入口停写控制，不能利用短暂停服冒充持续维护。已询问既有管理入口，不借Docker提升宿主权限或绕过门禁；在解决前不开始最新备份/迁移。原Staging可继续正常使用，尚无本次停机。

恢复后沿原单完成最新配对备份、隔离选转、新PG/对象及普通非owner身份、完整业务/引用/附件/权限门禁，再切入口并取得新source备份。预计约3h、维护预算3.5h，从真正维护开始计；开放新写前可取消，之后保全新写并v2兼容恢复/前向修复。90天从正式迁移验收成功起算。

Worker恢复、清理启用、退役旧库/备份、PR合并及Production仍不授权。新库实际业务容量/完整性/停机时间尚未形成，两轮自然调度/24h观察和7051旧历史限制未冒称解决。[前两阶段已接受结果](tasks/active/issue174-v2-phase12-results.md)及[本轮前摘要原件](tasks/completed/2026-11-26-before-issue174-phase3/README.md)保留历史日期/版本/限制；最新动态交付回执仍见Issue174。
