# Gate6D：Server预计到仓批次后台

2026-10-21；root唯一writer，既有server_convergence_review只读复审。输入干净
bb0ee1768d4d97c26b60458248e305fe5a241a97；独立GitHub API核实main仍为
996dfedc12da3527343cd3ff2aa5eea35497e10e，开放PR120–127均为原草稿、未变。
从此main创建codex/server-material-arrival-plans，再明确ff-only接续bb0；无继承dirty。
[输入摘要原文](../completed/2026-10-21-material-arrival-inputs/bb0ee176/)逐字节核对Git blob。

## 切片与现有规则

本阶段实现ExpectedArrivalBatch/Allocation的Server后台、只读历史及受控命令，先于页面接线。
复用D054、D065–069和唯一Material normalize/projection；不导入或修改Browser Repository/namespace。
Source交期、人工预计到已明确集货仓和实际入库保持三种事实。当前Source没有已证明的Hub到仓日期，
不自动初始化批次、不以“恢复来源”把供应交期冒充到仓；来源跟随接线在地点语义充分时单独验收。

需求行现有hash含数量，不能作为长期Allocation外键。Server以订单内规范化业务变体形成独立稳定身份，
完整身份证据与hash同时校验；数量/日期/事件/抓取时间不进身份。唯一映射才匹配，冲突不聚合、不猜。
来源减少、失去单位、消失、厂供及Hub改变均保留原计划/历史并要求核对，不能静默挪量。
允许分批和部分未安排；同一需求累计不超过当前已核验数量。人工批次不绑定或推算来源事件。

## 允许范围

- 前向0039（目前本地0038为最大号，实施前已核清单）；Server material-arrivals领域与契约/单测。
- 既有persisted Material reader提取同事务准备函数，不新建解析器，不读网络或凭据。
- 唯一app路由/index依赖接线；沿session/同源保护、fresh RBAC、CAS、预览指纹、请求幂等和同事务审计。
- 仅一次性合成PG/loopback HTTP；不升级3001/50426/59069/62426或既有卷。
- 文档、相关测试、必要归一引用登记及精确发布基线。业务/冻结证据旧blob不改。

## 必须验证

严格输入/真实日期/精确十进制；跨单/跨组/厂供/未知单位/超分配拒绝；数量变化身份稳定、
歧义和来源丢失保留历史；Hub更换不重新解释旧日期；Source generation、角色/用户撤权、
版本变化使旧预览失效；并发首次写、重放、同号异内容、未知回执、审计失败回滚；
只读不写入需求注册或生成批次，无金额泄露；原Source读取/归一/排单不回归；0038升级与新库相同。

Git仍STOP_AUTH_OR_DIVERGENCE（664f推送非零原因未证明），只读main成功不证明写通道恢复。
无新push/PR/Hosted CI/合并/关闭/部署或真实来源读取授权。D1935/D1933两笔单次真实额度均用完。
本阶段未完成前不更改能力状态；Goal active，Server收敛、到仓UI/逐物料物流、成衣Source和关账仍待。

## 定向验收与复审时序

初3契约通过600.754ms；首轮type因BigInt目标及审计类型失败，修复为现有ES目标与统一审计扩展后通过。
初17整合/既有generation通过27635.4996ms；跟进与升级24项通过28915.7061ms。
复审P2：规范大命令可能超过回执32KiB、私有确认构造快照时点改变；已分别修为60000输入/64KiB命令、
构造时克隆确认数据/元信息并固定单次配置。补大请求拒绝回执、丢HTTP回复、单位重建、Hub/归属变化测试。
最终定向26/26、0fail/cancel/skip，32717.1341ms；outputs/g6d-arrivals-directed-final-reviewed.log。
来源/安全首轮31pass/6fail（37含父项）、29864.0607ms，失败是旧安全fixture只有共享CCT但按已采用订单读价格。
相关生产商业代码/fixture与bb0无差异；只把未采用订单断言改为unlinked/current=null，不回退共享价，报价五组金额、
401/403/撤权/no-store保留。另加跑现有已采用business-source七角色，不冒称旧CCT端点正控。
修正后来源/安全45/45、0fail/cancel/skip，47736.5341ms，含确认数据与元信息外部修改不能改变构造快照。
引用/迁移/SQL归属55/55、0fail/cancel/skip，37362.7995ms；outputs/g6d-arrivals-inventory-upgrade-regression.log。
此定向时点类型与全lint通过；完整项目/发布回归、构建及精确源码守卫结果续记于下节。
既有审查者只读检查实际diff/未跟踪源码与日志，确认P2关闭、旧安全测试更新合理，无剩余已知公开API阻断；
未代跑测试、DB或网络。三个输入摘要与Git比较仅checkout CRLF不同，无内容dirty；归档仍保存原Git字节。

## 完整本地收口

源码checkpoint cbfd1e65595a05444e632b5bee9e0dec83c8e12b，干净。完整工程事实见
[冻结报告](../completed/2026-10-21-material-arrivals-engineering.md)，不覆盖原失败与中间结果。
该源码上项目927/927 232165.1055ms、发布116/116 230542.8865ms，0fail/cancel/skip；类型/全lint、
显式Server前端及顺序Node构建exit0，build20261021-183455。精确main996源码守卫11页/51能力/66累计UI路径/errors空。
收口前独立GitHub API仍main996；默认只读Git成功，OpenSSL进程对照uncertain_transport，不证明写恢复。
无新push/PR/Hosted CI/部署或真实来源读取。后续仅前向登记新后台能力，不重写原246证据/51能力。

工程报告原文冻结于440dda3958f6c2c61db08800b605abe92870bf26；独立复审进一步核对执行时点，
类型/lint在相同应用字节冻结前执行，构建/完整回归/守卫在cbfd执行。以6525963606f4ff285f3ab4800c5cd23996feab0d
前向更正报告，原blob不覆盖。初登记尝试将本次尚未提交清单的两份报告串为supersedes链，被现有守卫拒绝
（REVISION/ANCHOR/LEAF/WORKTREE_DRIFT；outputs/g6d-arrivals-metadata-precommit-guard.log），审查者同时指出。
不改守卫或伪造main锚点，仅首次登记652最终报告为新根，440报告仍由Git与本时序保留；两条候选记录均未进入已提交清单。
清单追加一条最终报告及material-arrival-plan-server独立manual-only后台能力，总247证据/52能力；
旧246证据/51能力及页面/CSS/运行快照/PNG逐项不变。没有把新后台写成已接通UI/物流。
完整元数据HEAD由最终Git提交绑定；最终精确main守卫另记outputs，不构造自引用hash或冒称Hosted CI。
修正登记后工作区守卫PASS：checkedHead652596、11页/52能力/66累计UI路径/errors空，
outputs/g6d-arrivals-metadata-reviewed-guard.log。独立审查者静态核对新根blob/hash/祖先、七维状态、旧清单及应用不变，
无剩余元数据阻断；未代跑守卫或其他测试。最终提交后的精确HEAD检查单独保留，不把此工作区结果冒称最终提交结果。
