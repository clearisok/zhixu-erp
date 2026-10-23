# 当前 Server 镜像与目标回执恢复验收

2026-10-23；完整 G1–G5 的本机隔离工程切片，不是既有入口升级或正式部署。
主控唯一 writer；原独立 reviewer 只读复审。

## 基线与范围

- main：`d1dd4f0fcf9992d5c055c7b67b6832b635485680`，本轮独立 API 核实。
- 开始分支 `codex/server-current-target-recovery`，clean HEAD
  `c54baa4d466d6657a760ceb6ab36c94586c065d9`；完整前置历史保留。
- 旧长期候选 `zhixu-quote-trial-server-g1` 仍为 8175f628/10月20日镜像；
  不能把它当成当前代码的运行证明。62426/62326 容器仍健康，3001 在监听；
  50426/59069 本次监听快照未出现，不据此判为已退役或删除。
- 最近实际非空恢复镜像357a88e5只含至0043；本次新0044回执没有非空恢复实证。

## 实施与验收

只扩展已有 `persistent-domain-*` 和 `persistent-local-trial` 测试：
通过镜像内原编译 target plan/apply 生成启用、停用、再次启用三份回执。
原启用重放只返回历史结果，不重新启用；恢复后读取原回执、原ID和前后全库指纹。
旧库未消费的配置预览在恢复库被数据库指纹阻断，新预览才能在新库停用。
0044必须非空才可计为恢复覆盖，不能用空表相等冒充。

从新的干净提交 Git archive 构建精确镜像，保存 image ID、commit、tree、build/time，
不复制工作树 dirty 或沿用旧标签。原测试只创建两个随机、自有、内部网络项目，
通过原备份/恢复工具验证真实DB与对象存储字节。失败保留私密夹具和自有卷，
不得清理无关环境。测试成功仅清理本次自有一次性测试资产。

语法、相关纯测试、scoped lint、实际 Docker 构建/恢复、精确 main 门禁、发布回归、
独立复审分别记录实际终态；未执行的检查不预报通过。

## 安全与交付

不改业务、UI、SQL、权限或原运维工具，不读取真实凭据、旧私密报表或真实 Source，
不激活实际target、开调度、迁移既有库或修改账号。所有源读取为合成 worker，
原应用网络只允许本次内部 Docker 网络。3001/50426/59069/62426、Browser 数据、
其他工作树、卷和原runtime refs全部保留。

Git NETWORK_DEGRADED 不重复推送；Hosted CI 被账号 Billing 拒绝启动，用户已要求
继续可做交付，不重派 CI、不改账单、不新建重复累计PR。不自动 merge/close、
不切换50426、不退役旧环境。完整 Goal 仍 active；原关账/coverage-v1/切换待决不默认。

## 当前检查

初步语法检查、scoped lint 与恢复守卫纯测试10/10通过，0fail/cancel/skip；
实际新镜像和双项目恢复尚未执行，独立 diff 复审进行中。

## 首轮镜像与 Windows 测试驱动修复

精确source `5e0967cdfd22e998d564c9a139622f8de39e3b8d` 的新镜像构建通过，
46 routes / 0 skipped，Server编译通过；image ID
`sha256:85f49cbe94cf63442db24b502b52a637de226f78d2e660d6059aff9c4ad99079`。
首轮恢复在调用native seed前发生Windows `spawn ENAMETOOLONG`；不是数据库或
目标业务断言失败。完整结果和日志保留于ignored
`outputs/goal-next-audit-20261023-c54baa4d/image-1351477dd3`。
失败时仅停止本次成功准备的自有项目，保留其私密夹具与卷，旧容器身份/状态/端口逐项保持。

原native程序随0044测试扩大超过命令行上限，修为固定短argv、通过stdin传递程序及
双JSON编码的合成输入，不经过shell。编译服务和镜像输入未改；后续重跑另记driver SHA，
沿用原精确5e096镜像而不重新标记其构建版本，先核对两SHA间只含测试/文档。
不放宽permit、网络、来源/数据库范围或备份恢复保护，首轮失败不得改写为通过。

## 最终隔离恢复及成本策略

clean driver `848acfc721de8f0ae5ad2390ddbfac984f573829`、原5e096镜像在第三个新随机
双项目中9/9通过411361.7715ms，0fail/cancel/skip；108张表中70非空/38明确未覆盖，
5个sequence、43迁移。0044三份原回执恢复保持1/2/3版，旧库未消费预览在新库被拒、
新预览停用到4版，旧enable重放不重新启用。旧容器元数据及运行态refs保持。
[冻结报告](../completed/2026-10-23-current-target-command-recovery-engineering.md)
保存两次失败、实际镜像/driver不同SHA、23份原日志hash及范围。

第二轮7pass/2fail发生在DB指纹/对象恢复后、恢复app启动前，原错误脱敏，不能断言唯一原因。
随后新空网络probe直接确认Docker地址池耗尽。仅释放本轮两次失败的13停止容器/5空网络，
179卷名称及无关容器/网络、私密输入/备份保持；未声称卷内容逐字重核。首次释放因Mounts
返回顺序漂移在任何rm前停止，deepEqual核实仅数组顺序后再固定排序，不放宽身份保护。
第三轮使用相同代码/镜像，不重写失败或批量清理旧环境。

本片无产品/SQL/UI/权限或workflow变化；纯10、scoped lint、镜像编译46路由0skip、
848精确actual-main守卫已通过。发布回归/最终HEAD守卫和新远端交付另记，不预报。

用户已确认Billing修复与USD5月预算。按[成本评估](ci-cost-control-2026-10-23.md)保留
必要合并检查，不重跑旧计费失败或反复派完整CI。原“Billing未处理”保留为各时点历史，
本轮没有付费运行或新PR；后续交付仍遵守独立精确SHA核对与禁止重复累计PR。

## 发布回归收口

稳定b8c6937170a93fd7105f26472f107866c4000ae3发布134/134通过570330.8831ms，0fail/cancel/skip；前后HEAD/清单hash/clean保持。独立增量复审核对23证据hash、原330对象/59能力和成本评估，未发现P1/P2，复审者未运行测试。

15:06:33Z独立API main仍d1dd、五草稿heads不变。最终仅四状态文档commit，随后对精确最终HEAD运行一次actual-main守卫；不重跑unit10、9/9恢复、同产品镜像、全项目或UI。新成本策略下不派CI/重跑旧失败、不新建累计重复业务PR；作为验证引用交付，最多一次既有安全工具Execute、独立核实远端，任何STOP不重推。最终本机回执见ignored outputs/goal-next-audit-20261023-c54baa4d/final-closure.json。
