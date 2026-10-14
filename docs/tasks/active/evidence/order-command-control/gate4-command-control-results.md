# Gate4 正式新命令暂停与兼容回退：冻结工程证据

核实2026-10-15；GitHub API main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；本地feat/order-effective-attribution，阶段起点6f181d3bc5af0271c1a0949b2be0ef3a1713bbd6。源码/本文所在checkpoint由release manifest记录完整recordedAtSha，不伪造未来自引用SHA。GitHub是实时工程事实源，本文是此次阶段快照，不覆盖旧证据；后续实现/范围/验收变化另出新证据。

## 已确认工程事实

0021控制行及不可变事件、SQL普通DML暂停、单进程只能更严格的配置、只读状态查询已实现。DB排空等待事务结束；新SO、订单价格版本/当前头、归属账本/头及旧Order CCT写入受控。新API预检+SQL兜底；Source绑定/新增原子回滚，既有绑定与Source刷新保留。没有HTTP控制mutator，不接受客户端模式、actor或启用许可。

规则来自用户D121已批准计划；实现与实证在server/sales-orders/command-control.ts、server config/index/app、0021及三个order-command-*测试。任意外部writer、Browser/legacy全库只读不在此范围；真实控制写入/部署没有授权或发生。旧ID、创建历史、价格、执行引用不移动或清理。

## 实际验证

- npm run test:order-command-control：18/18；暂停原业务逐表保留，拒绝普通SQL伪造历史，审计末端失败回滚，raw旧写入、API模式覆盖、fresh grant撤销、等待真实事务、RR旧行、缺schema、加工意向/消费、Source首绑/新增/已有刷新与准确回执。
- npm run test:order-normalization-execution：30/30，新增完整合成permit也受暂停阻断且proof回滚。
- npm run test:order-effective-attribution：45/45，含0020写保护和历史Source epoch。
- npm run test:processing-batches：35/35。
- npm run test:ainuoke-continuous：43PASS/1Windows skip；不是此次真实调度运行。
- npm run test:postgres：261/261，所有数据库由测试新建；无真实连接。
- npm test：824/824；npm run test:release-baseline：78/78。
- 无缓存typecheck、完整lint、Server build：明确exit0；没有新的UI文件或像素验收，Inherited UI范围仍由此前各Gate证据保护。

原main精确Git源码在自有临时目录编译成Server二进制，运行原migration verifier及index，确认新schema缺少旧bundle认识的0014后续文件时拒绝启动、退出1。所有账号/权限/业务表逐表不变，无listen/bootstrap。Git LF旧SQL用于镜像字节，与Windows CRLF检查区分。兼容的前向bundle readonly verify与frozen身份查询通过。未重建原Docker镜像，未认证旧Browser/legacy、真实目标或备份恢复。

## 分维度状态

implemented=yes，仅上述暂停/状态/SQL保护；isolatedTest=passed-historical，仅2026-10-15合成PG、临时原Server实证及相关回归。merged=false；未push/新PR/远端CI，不是main能力。humanAcceptance=not-run；没有用户浏览器验收。sourceActivation=not-applicable，此控制没有激活来源/扩范围/调度。trial18443=not-deployed，preview18444=not-deployed；历史环境证据保留，不因本轮测试重新观察或宣称改变。

## 失败与修复及剩余

初次13项10PASS/3FAIL因测试误读既有decimal string/候选DTO，类型还拦截额外身份属性、failed union及NODE_ENV widening；按实际契约修正后通过。原Server回退子进程环境再次widening在最终无缓存类型中纠正。没有放宽暂停、权限、幂等或SQL检查。

实际暂停需精确目标/writer清单/当前CAS版本及具体授权；恢复enabled需新授权/原因/验收，不自动重开。当前历史Source/复核UI、整个G4工程及远端交付仍未完成。全量真实来源及真实归一/恢复不因此测试通过而获授权。G5与全计划查漏保持。
