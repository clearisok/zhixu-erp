# Gate7H 成衣目标配置的原操作者接线

2026-10-23，root唯一writer，既有独立reviewer只读。完整G1–G5 Goal继续。

## 基线与范围

main d1dd4f0fcf9992d5c055c7b67b6832b635485680及五个草稿PR121–125已由独立GitHub API重读，heads未变。开始分支codex/server-garment-target-operator从该main建立，再FF完整cd7cd459885230b839d8d98a723f8f26e7d5bd24，工作树干净。前片Gate7G在稳定25da上954项目/134发布均0fail/cancel/skip，最终cd7c精确main守卫通过；原源码5fac、报告492b及324/59证据保留。

本片只扩展原garment-operator-cli.ts，接入已有D160 plan/apply/receipt，不建第二个CLI、配置表、迁移、权限或采集器。新增明确plan-target、apply-target、target-receipt动作；plan/apply另需enable或disable，enable明确freshness-ms。复用原私密单SO job与完整producer证明；停用和回执不打开证明、凭据或Source网络。apply必须使用原UUID/期限/精确hash和独立确认短语，不能以采集确认短语混用。

新公开结果只投影配置终态及历史标记，未知COMMIT不得输出暂定配置成功；报告写入失败仍先核对原请求。target回执只走原0044，collection回执仍只走0043，相同UUID不得混淆。新旧命令均验证原干净已提交源码、当前migration状态和fresh角色；不迁移、bootstrap、自动重试、调度或真实采集。

工程入口不是实际目标激活或新Source请求授权。本轮只在自有一次性PG、合成证明、计数fake transport验证；不读真实凭据或旧私密报告，不写现有数据库、账号、target或环境。3001/50426/59069等与原runtime refs保护。Git NETWORK_DEGRADED，故只本地checkpoint，不重推、不建重复累计PR；Billing未处理，不重新派CI或改账单。

## 预计验收

- 严格参数矩阵、action冲突、enable必填时效、disable/receipt拒绝时效/凭据、不同execute短语隔离。
- 原plan无写、配置原子采用、停用可脱离证明/profile健康、历史回执不重新启用；配置与采集账本独立。
- 当前角色权限、CAS/期限、未知结果/公开脱敏；原采集入口不回归。
- 实际clean源码子进程配置/回执，合成目标启用→原采集→停用→回执完整链，无真实网络。
- 类型、lint、构建、原控制层回归、精确main发布守卫及独立复审；按实际执行记录，不预报PASS。

## 首轮验证与修复

原target20/20通过14016.558ms，0fail/cancel/skip。首次Server编译及scoped lint退出0。操作者首轮25项23pass/2fail（436062.3783ms，0cancel/skip）：失败为新目标全链的采集成功断言及其父test，实际返回COLLECTION_NOT_PUBLISHED；原采集/恢复全部通过。新fake worker只推进10ms，而原workerFrame第一条capture在结束前20ms，导致首条落在本次开始之前。夹具按原操作者测试改为推进100ms；不放宽生产时间校验、不重试真实请求。此原失败日志保留initial-operator.log。

独立实际diff复审无P1/P2；非阻断建议将公开action转字符串改为严格枚举，已采用。真实COMMIT后响应丢失、报告落盘失败、缺证明/profile停用、意图冲突/fresh权限/CAS等新负测在首轮通过；dirty子进程仅正确拒绝执行，不能冒充clean正控。接下来保存source checkpoint，再精确native构建及clean目标/纯测试；最终结果另记，不预报通过。

source7ece2f5a2a8c290fa15c0e35426748abf5840201上新纯测试7/7通过19365.2922ms，clean目标全链8/8通过238629.8621ms，均0fail/cancel/skip；后者实际源码子进程依次plan/apply/删除证明后receipt正控通过，没有Source IO，前后HEAD保持、dirty空。初次精确native全量typecheck退出2（33859ms），四处均是新增测试的联合返回类型/字段缩窄问题；后续只修正测试类型声明和一条字段存在断言，业务源码不变。原exact-qa失败目录保留，新的精确QA另写exact-qa-final，不覆盖失败。目标集成测试的可执行转译字节需与7ece比较，不能把原运行SHA冒称成新提交。

## 精确检查与证据绑定

最终source ffa56b683333f61e7e0f23ed122a26854a5a4204，tree c74db8b6bd7cb3e0e1509a41107d01bd74c232bb。type-fix-equivalence.json实证业务源码与7ece不变、目标测试转译JS逐字一致，SHA256 66305fad4cbf97568d8eb83a8ee268ef1e6b66a88694238dbf1a73d7549e400f。新增断言的纯7/7重跑通过18208.5865ms、0fail/cancel/skip。

精确Git archive/native context全量types29475ms、Server编译10838ms、完整lint56783ms、显式Server UI构建14955ms退出0。46路由/0skip/单Context，原用户路由生成，build-info精确ffa；HEAD稳定、dirty空，没有安装依赖/新镜像/部署或像素接受。独立实际源码/终态/等价复核无P1/P2，复审者未执行测试。

[冻结工程报告](../completed/2026-10-23-garment-target-operator-engineering.md)03cc4bf1a34fbc53026be59e0b82479dc281bc6f，blob SHA256 c7ab1822838fd1be87adda3c1afe3a3b514fa63abd307062a9ae56edd8181ea1。D161与两feature及报告前向追加4份为328/59；原324对象、其他58能力/维度/UI/运行态及批准保持，manifest SHA256 daa3fd4697b92851aeee001b0f4b344a1837c84ccce4be3e22d126eedbc5b648。13:47:51.950Z独立API main/五草稿未变。下一步稳定清单的精确main守卫、发布134和最终状态收口，不将待运行写成PASS。原失败和16日志hash保留，Git降级/Billing阻塞不重试或改写。

## 绑定复审P2及纠正

原3fb5c93b5d156a27db79079056ee1ebec8b14c79实际main守卫FAIL八条REVISION/ANCHOR/LEAF/DRIFT；同HEAD发布134/134通过555149ms、0fail/cancel/skip，前后HEAD/清单/clean稳定。两者职责不同，134通过不能替代actual main守卫。独立复审定位两个前驱feature均是尚未进入d1dd的新根，不能按已有main锚点继续修订。未改业务或守卫以消除失败。

[8b63纠正](../completed/2026-10-23-garment-target-binding-correction.md)保留原03cc报告与Git祖先；[拒绝候选档案](../completed/2026-10-23-rejected-garment-target-binding/README.md)无损保存完整B清单、两modified feature、原JSON、8错误和134终态。两个失效ID仅退出未通过的活动候选，永不复用。两旧feature恢复cd7冻结blob，当前D161使用独立AINUOKE_GARMENT_TARGET_OPERATOR.md；旧324证据全部不变，原合法D161/report保留。

新清单330/59，其他58能力/非目标维度/UI/runtime/批准保持，manifest SHA256 79e3631d9a772f8334fa4b56781eda9b8d0b8fc7d694c93d097ab5796669cf16。业务代码、SQL、测试和validator不变；仅文档/活动证据修正后重跑actual main守卫与独立复核。134结果继续归属3fb，不能声称在新HEAD重跑；当前修正守卫尚待，不预报PASS。
