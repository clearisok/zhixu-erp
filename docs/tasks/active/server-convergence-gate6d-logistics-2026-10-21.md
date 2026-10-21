# Gate6D：物料物流基础资料的Server收敛

2026-10-21，root唯一实现owner、既有reviewer只读。已批准全项目Server收敛包含这些现有基础资料；Gate6原记录将集货仓/路线/运输方式后置，没有将其定义为成衣出货事实。

## 基线和独立范围

本轮独立GitHub API核实main仍996dfedc12da3527343cd3ff2aa5eea35497e10e；#120–127的原完整头和open draft状态未变。codex/server-logistics-resources从该main创建后显式FF到干净717bbab20a55faeeecf52f30c0546aafa0e4aa1d，无继承dirty，旧分支/PR/运行环境不改。

三输入摘要保存于[717输入](../completed/2026-10-21-logistics-resource-inputs/717bbab2/)，复制时工作树字节SHA256相同；提交按仓库LF归一，归档Git blob须与717原blob一致，不改变历史内容。664f工具源码/唯一CI39543987486成功与实际push exit1的STOP分别保留；远端Git写入仍停止，不重推、不换认证或修改共享配置。新增业务工程只依赖已验证的本地对象，不借旧CI宣称新切片通过。

已读取operations-settings模型/原运输方案表单、production-resources四类型契约/service、BUSINESS_RULES和D-043/D-054/D-065/D-068。仓/路线/方式是独立基础资料；明确ID关联、自然日运输、缺仓不推断、推荐不创建物流订单/改排期的规则继续有效。原Browser默认仓、首项自动选中和聚合normalize不能成为Server初始化。

## 本切片：只冻结输入契约

复用现有production-resources命令外壳与基础字段校验，新增物流输入契约：集货仓及“路线+方式列表”一次编辑的运输方案。不注册新HTTP kind、不建表、不改权限/表单或Browser仓库。本切片的通过不等于物流Server能力完成。

- 稳定UUID与创建/更新版本规则沿用原命令；actor、服务端时间、价格、币种、订单或出货字段不接受。
- 路线明确引用Hub和ProductionSite，名称不当身份，不选默认仓/地点。方式的route归属由父方案决定，不允许嵌入另一routeId。
- 新方式不接受调用方生成ID；已有方式按稳定ID完整提交，遗漏/混入其他方案的方式拒绝，停用保留身份。事务层后续必须核实父资料/完整子集合/启停及CAS，纯parser不证明这些事实。
- 保留零自然日、独立启停、重复名称和小数排序；自然日输入要求非负整数，技术上限3650日、每方案100个方式和排序绝对值10亿，越界拒绝而不静默截断/四舍五入。沿用现有文本/Unicode与备注格式保护。
- 本轮不提供物流推荐、订单Hub/ExpectedArrival写入、运输记录、成衣出货或关账；没有真实来源/账号/业务库、部署/资产退役操作。

## 后续交付与验收

先验证纯输入与既有四资源兼容、类型/Node编译/lint，再保存独立本地checkpoint。后续复用production-resources事务/权限/审计/回执服务，新增前向空表和引用约束并在一次性合成PG验证；之后才接既有表单、权威资料与物流投影。不能把未接HTTP的契约作为可体验功能。

Gate7成衣出货业务时点、Gate8剩余关账口径仍待用户决定，本切片不替用户选择。3001/50426/59069/62426、旧卷/工作树/Browser保持。阶段起始时尚未运行新测试；下面保留后续实际验收时序。

## 纯契约工程结果

新增logistics-contract及11项负向/身份/边界测试；contract.ts仅提取原精确命令外壳并导出同一基础校验，原4种运行时API不变。原四资源8项与新11项实际19/19（432.8762ms）通过；全量typecheck、Node编译、三精确路径eslint通过。

随后按Source CI同一资源命令串联临时PG/HTTP回归：36/36（9777.5678ms），0失败/取消/跳过，验证原资源权限、CAS、回执、关联锁、撤权和审计回滚未回归。仅创建/删除fixture自己的随机tmpfs PG；没有物流新SQL或API。Source验收workflow只增加新测试路径，未派发新Hosted CI。

既有reviewer只读核对实际diff与36项日志，无阻断，没有替其声称运行测试。归档按Git blob核对，不能将LF/CRLF差异当历史内容丢失。随后源码/事实checkpoint及精确main守卫；远端写入仍STOP，不借664f CI或重推通道。原19/36日志在ignored outputs/g6d-logistics-*；基线守卫不替代物流DB/UI验收。

## 后续后台阶段基线（2026-10-21）

root继续唯一writer，复用既有只读reviewer。main通过独立GitHub API再次核实996dfedc12da3527343cd3ff2aa5eea35497e10e；保留既有codex/server-logistics-resource-store，从其干净97cfa显式FF到f59cf6ec0b383771dd14350bf99053dd85404a36，未reset/rebase/丢弃历史。起始工作树干净；f59精确main守卫PASS，D152新证据链116/116（345552.8014ms）。三份输入摘要以原Git blob保存到completed/2026-10-21-logistics-store-inputs/f59cf6ec/。

本阶段仅增加物流资料空schema与同一production-resources服务/HTTP类型；新迁移使用下一编号0037，不重写0001–0036。沿用settings.production_infrastructure.edit、fresh actor、原actor/request互斥、全资料写/冻结锁、CAS、事务审计和不可变回执。原四资源的客户端类型/页面/Browser路径保持；正常启动仍verify-only，所有新迁移只在自己的随机一次性PG运行。

运输方案父行拥有一次版本，完整子方式列表原子保存；现有方式（含停用）必须全部保留，新方式只由服务端分配UUID，不能搬到另一方案或物理删除。保留输入顺序以支持明确重排和准确no-op；排序值不作时长。启用方案要求真实启用仓/地点/日历；停用父资料不级联改既有子事实。现有物流按Hub+Site取路线，为避免多条启用路线被任意first匹配，同一对ID最多一个启用方案；可保留多个停用历史方案，不按名称去重。列表只返回方式数量，详情才读取完整方式，避免大列表复制100项子集。

先写HTTP/真实PG负向验收复现当前新kind不可用，再实现并覆盖并发、回执丢失、父子锁/撤权、审计回滚、升级不改变旧资料/计划/执行/审计/权限。没有新页面、物流推荐、订单Hub写入、Source请求或出货/关账能力。D152已确认Num/outdate，不改本文件上段当时待决时点；Gate8其余规则仍待决定。

### 后台实际验收时序

新增真实PG/HTTP测试先复现当前空列表新kind400及创建新kind400（0通过/2失败，5846.7471ms），原日志outputs/g6d-store-before.log保留。实现后首轮12/12（7888.9947ms）通过；补齐真实COMMIT后丢响应、后段子项失败、全资料freeze与父Hub行锁等待、100子项上限及0036非空升级，组合新旧资源与纯契约59/59（21194.6082ms，0失败/取消/跳过）通过，日志g6d-store-regression-first.log。

新升级测试先在0036创建可信合成SO、资源、排单、10.125实际产出及其版本/回执/审计，再对全部原public表（除schema_migrations）取字节快照；缺0037时新kind503且不写入，显式运行0037后全部旧数据及原请求重放完全不变，新表全空、二次迁移无增量。原0034→0035→当前升级测试仅将最新后缀期望改为显式CURRENT_MIGRATION_FILES，不删数据断言、不改旧SQL。新迁移登记为0037，原0013缺号历史不补造。

全量typecheck、Node编译与11路径源码lint已通过。全项目、全PostgreSQL、生产计划/执行回归、候选构建与独立只读复审继续，最终结果未取得前不写PASS或Hosted CI/交付。没有新UI文件/业务金额/权限目录变化；旧243+新D152=244证据、51能力状态和PNG保留。

### 容量复审、修复和最终本机结果

上述广回归实际全通过：PostgreSQL269/269（264890.3776ms）、生产计划/执行组合98/98（70871.3071ms）、项目927/927（379376.4553ms），均0失败/取消/跳过；全量lint及显式Server候选build成功。对应日志outputs/g6d-store-postgres.log、production-regression.log、project-tests.log、full-lint.log和candidate-build.log。本次候选是工作树工程构建，环境source标记仍输入f59，不将它当精确新源码的运行/发布证明；后续源码checkpoint后再做精确构建。

既有reviewer未访问网络/DB或执行测试，独立只读指出一项P2：接近1MiB的合法输入，在生成100个子UUID后可能超过原0034回执JSONB文本上限。主控补真实HTTP/PG红测，实际16通过/2失败（7930.083ms），明确500≠期望422，g6d-store-capacity-red.log保留。随后仅对新物流kind，在resource_apply SAVEPOINT内按PostgreSQL octet_length(result::jsonb::text)测实际结果；超限回滚父子/审计并保存精简422/logistics_result_too_large拒绝回执。不改旧表1MiB约束、HTTP上限或旧四类型错误语义，不截断/重试/加Seed。

修复后重跑完整新旧资源/纯契约/0036非空升级组合60/60（22905.2786ms，0失败/取消/跳过），含小于HTTP上限的实际请求、超大生成结果、known拒绝/原请求replay及父子/审计零遗留。最终全量types、Node编译和改动三路径lint通过；这次结果在g6d-store-regression-final.log、typecheck-final.log、server-build-final.log、capacity-lint.log。此前269/98/927是修复前广回归，按原时序保留；最终新旧共享事务路径和新增容量分支由60项重新验证，不伪称又跑了一轮269/927。

本阶段基线116/116（319435.4533ms，0失败/取消/跳过）通过；working-tree精确main996/f59守卫PASS（11页/51能力/累计63 UI路径、errors空），完整manifest与f59逐项相同，三个输入摘要与原Git blob字节一致。当前无新UI影响、能力状态/截图/权限或来源范围变化；容量修复独立复审、最终源码checkpoint与精确HEAD守卫/构建继续，不借旧CI或声明远端送达。

容量修复后既有reviewer再次独立只读核对代码、数据库字节口径和实际红/绿日志，确认P2已消除、无新增阻断；其没有运行测试或连接DB/网络。随后仅保留源码checkpoint后的精确HEAD/main守卫与精确source标记构建收口。此前全部原生测试进程已正常终止，无遗留调度/监听入口。
