# Server人工预计到仓后台：工程验收

2026-10-21；root唯一writer，既有server_convergence_review只读复审。
分支codex/server-material-arrival-plans；独立GitHub main为996dfedc12da3527343cd3ff2aa5eea35497e10e，
从此main建分支并明确ff-only接续干净bb0ee1768d4d97c26b60458248e305fe5a241a97。无继承dirty。
[输入三摘要](2026-10-21-material-arrival-inputs/bb0ee176/)与旧Git blob逐字节核验；工作副本仅checkout CRLF不同，
内容/索引均无继承差异。当前状态不是此前阶段原文，旧日期/hash/测试/限制按原字节归档。

## 应用源码与范围

源码checkpoint cbfd1e65595a05444e632b5bee9e0dec83c8e12b，32文件1491新增/92删除，含文档/输入原文。
本报告及后续能力登记为前向文档checkpoint，不替换应用hash；最终HEAD以Git核实，不构造自引用hash。

0039新增空的Server人工ExpectedArrivalBatch/Allocation owner、长期需求注册、逐次计划历史、请求回执及SO桥接。
旧0001–0038不改、无seed/backfill/Browser导入。当前源交期不具备已证明的到Hub地点语义，仅作对照；
没有自动Source批次/恢复来源写入，不自动补齐、不绑定四流，不改订单/排单/实际产出/价格/币种/出货/关账。

长期UUID以SO内完整规范化变体为据，数量/日期/单位/事件不入身份，保存完整身份与SHA256共同核对。
Canonical按原D069只分组；多候选不聚合。数量变化保持UUID和人工计划，减少超配只提示；
单位变化先明确移除旧分配再重填，厂供/消失/歧义留旧历史。每个计划保留当时Hub的ID/name/enabled/version及
tracking版本；改仓不自动重新解释日期。DTO不输出生产备注、仓备注、采购/商业金额。

沿既有Material pipeline、Source完整分页/合同/归属/时效校验；reader提取PoolClient同事务准备，旧GET保留RR外壳。
写锁序effective fence→fresh actor/角色→actor-request→Source profile共享锁→物理SO组，兼容采集profile→SO。
预览指纹/CAS、整数精度外的十进制文本、事务审计、已知拒绝回执和原UUID恢复均在本owner统一完成。
Source不可用可明确清空旧计划，历史证据不能用于新增Allocation。原OperationLog与归一引用/完整命令指纹复用；
不开放归一执行。没有UI、第二套物流算法或Browser写入。

## 定向测试时序

均在自有随机一次性PG/loopback，无真实凭据、Source、账号或业务库；以下数值包含父项时明确按日志总数计。

- 初契约3/3，600.754ms；首轮type因ES目标BigInt literal和审计类型失败，改用现有目标及明确action/entity后通过。
- 初整合/既有generation共17/17，27635.4996ms；跟进/升级组合24/24，28915.7061ms，分别保留原时点。
- 复审发现规范最大命令超过32KiB回执容量，改为60000字节规范输入/64KiB命令库；补超过32KiB真实HTTP拒绝、
  核对及重放。私有确认冻结时点回退改回构造时克隆byOrder/sourceKey/accountFingerprint，函数内固定配置/指纹。
- 中途扩展24/24，36436.3017ms；再补丢HTTP回复与单位重建25/25，36400.2145ms，不覆盖原日志。
- 最终`npm run test:material-arrivals` **26/26**，32717.1341ms，0fail/cancel/skip。覆盖3契约、0038非空升级、
  18项人工批次子项及父项、既有generation。含并发、profile→SO交错、撤权等待、Hub旧预览、物理归属、
  单位正控/历史、审计回滚、超配、未知/待定回执、COMMIT后丢HTTP回复、锚定完整历史和超限请求。
- 来源/安全首轮37中31pass/6fail（含父项），29864.0607ms。失败的旧fixture只有共享CCT link，没有订单独立采用；
  D145当前订单读不回共享CCT，旧断言读current.sale报null。相关生产商业代码/fixture与bb0无差异。
  只更新该测试的未采用订单分支为unlinked/current=null且无共享金额；报价五组售价/工价/成本、401/403、撤权、no-store保留。
- 修正后来源/安全组合 **45/45**，47736.5341ms，0fail/cancel/skip，包含原私有确认数据与元信息构造后外部修改、
  Source历史、Material HTTP、旧安全测试和七角色已采用订单`/business-source`。后者不是旧确认价GET的已采用正控。
- 引用/迁移/原SQL归属组合 **55/55**，37362.7995ms，0fail/cancel/skip。完整引用盘点含新四个SO引用及关联命令
  全字节指纹；半套schema/未知FK、原有效归属/恢复/freeze和迁移启动边界不回归，不因此授权真实归一。

0038→0039升级保留当时所有旧public表行（含非空Source/tracking/回执/角色）逐字节相同；新五表空，重复迁移无新增。
旧跟进升级组合另保留已有计划/实际完成等旧表字节检查；不把此前269全PG或UI37/23结果写成本轮重跑。

## 源码checkpoint完整门禁

最终应用源码字节冻结为cbfd1e65595a05444e632b5bee9e0dec83c8e12b；类型/lint在该checkpoint建立前完成，
随后构建、完整回归及精确源码守卫在cbfd执行。没有产品代码在这些验证后改变。

- `npm run typecheck`、全量`npm run lint` exit0。
- 显式Server quote/master、session、writable、orderRead=snapshot构建：buildId **20261021-183455**，
  buildTime **2026-10-21T18:34:55.1787640+08:00**，gitCommit完整cbfd；前端及随后Node Server构建均exit0。
- `npm test` **927/927**，232165.1055ms；`npm run test:release-baseline` **116/116**，230542.8865ms，
  两者0fail/cancel/skip。不是伪造单次全绿：上节类型/旧安全失败及修正时序保留。
- 精确main源码守卫PASS：checkedHead完整cbfd，11pages/51capabilities/累计66 UI路径/errors=[]。
  本次唯一feature模型变化是审计action/entity type union，精确V0记录；没有新页面/样式/像素或人工接受主张。
- 独立审查者只读核实实际diff/新文件、P2修复、恢复路径和日志终态，无剩余已知阻断；未代跑测试、DB或网络。

本机ignored证据`outputs/g6d-arrivals-*`保留first/reviewed/final日志、构建身份及源码守卫。
所有测试进程已终止，fixture自有资源清理。未触碰旧体验环境及其容器/卷、其他工作树、Browser或真实数据。
旧246条证据、51能力和历史截图保持，后续只前向登记本后台能力的分维度证据。

## 远端与运行边界

本阶段没有push、创建/更新PR、Hosted CI、合并、关闭、部署或来源激活。新增CI步骤已在源码中准备，不能称已运行Hosted CI。
664f历史push实际exit1的具体原因仍未证明，旧STOP_AUTH_OR_DIVERGENCE保留；exact664/旧CI不冒充本阶段送达。
本次只读诊断未改配置/未push：Node24.16/Git2.54，默认Schannel/HTTP1.1可读main996（exit0/3591ms），
HTTP1.1对照exit0/2871ms，OpenSSL/HTTP1.1进程对照exit128/uncertain_transport/3256ms。它只证明这些读取，
不证明推送恢复或旧失败根因，不更换共享认证/代理/TLS，不反复撞写通道。

保护3001/50426/59069/62426及原卷/账号/Browser；62426仍8175，未升级。18443/18444没有本后台部署，
既有runtime元信息只保留原历史观察，不作本次新巡检。本轮没有真实Source查询/绑定/激活/调度、安装依赖或正式数据库迁移。
D152的6086979 Num/outdate已确认，两笔固定真实核验额度用完，不因此扩大读取或自动关账/收入。

下一独立切片仍需原页面ExpectedArrivalBatch编辑/恢复保护与逐批唯一物流服务接线；Source-following需充分地点证明。
成衣正式跨次身份/合同颜色、Server关账及环境收敛/用户验收继续按总计划推进。Goal active，完整目标未达成。
