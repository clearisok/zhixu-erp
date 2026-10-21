# Gate 7A：成衣出货 Server 观察与可信订单读取

2026-10-21；root 唯一 writer，既有 server_convergence_review 独立只读。用户已批准 D-147 持续 Goal，D-152 明确 Num/outdate。本阶段不是新增真实来源读取或激活授权。

## 开始基线

- 输入分支 codex/server-material-arrival-ui，HEAD e4d7a8dd6f6bd3c409747ab44b71823422cfb8d1，git status 干净。
- GitHub API 本轮独立核实 main 996dfedc12da3527343cd3ff2aa5eea35497e10e，开放草稿 #120–127 的 head 与上轮一致。新分支 codex/server-garment-shipment-observations 从该 main 建立，再仅 fast-forward 到完整 e4d7 输入，保留既有提交。
- 三份根恢复文档逐字节保存在 ../completed/2026-10-21-garment-shipment-inputs/e4d7a8dd/；原冻结报告、截图及证据不改写。
- 旧 Git 664f 非零 authentication_or_divergence 具体原因仍 unresolved，相关写 STOP 保持；本轮只读 API 成功不能当作写通道恢复。无新 push/PR/Hosted CI。

## 本阶段允许与不允许

复用可信 Source profile、合同接纳身份、有效归属和稳定订单颜色，增加有界完整观察快照、不可变保存、并发保护、审计及 DB-only 读取。Num/outdate 分别作为本笔数量和出货日期；其他日期、累计列和原始行证据独立。行号只作捕获内查重，跨快照不相加；消失不等于取消，未知日期不填默认值，未匹配颜色保留而不猜测。

不重建订单、生产完成或价格，不自动关账/收入/收付款。当前没有已验证的6086979精确合同过滤、稳定事件ID或撤销语义：本阶段不能宣称真实 Source 闭环。正式采集、查询核验和激活仍须各自证据与具体授权；本轮只用合成数据，不新增外部 HTTP/读取私密原文或凭据。

不启动/停止或升级现有运行环境，保护3001/50426/59069/62426、18443/18444和其他历史资产；不修改真实账号、业务库或 Browser 数据。不安装依赖、合并、关闭 PR 或部署。

## 分阶段验收

1. 先核实际代码/SQL/API/测试；精确字符串字段、分页完整性、两遍一致、合同校验、行重复和未知值具有负向用例。
2. 新 schema 只在一次性合成 PostgreSQL 中验证空表、升级、不可变与归属约束；读取不得触发 Source、接受客户端绑定或泄露 wxprice/来源敏感字段。
3. 验证捕获后 profile/权限/合同/颜色变化、并发发布、回执重放、历史保存、过期/缺失与加工不适用。纳入引用盘点，不能绕开有效归属保护。
4. 完成实际定向测试、类型/lint、相关回归、构建及精确 main 发布守卫；独立复审后冻结工程证据，分别记录实现、远端、运行与真实来源状态。未运行的检查不写通过。

本阶段开始时尚未新增实现、测试或数据库操作。完整 Goal 仍 active；后续正式采集/UI、Server 关账和环境收敛不因本切片完成而消失。
