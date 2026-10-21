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
