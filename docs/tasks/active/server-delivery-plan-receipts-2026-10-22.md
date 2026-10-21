# DeliveryPlan可靠保存与精确回执

## 基线与范围

2026-10-22，`feat/server-delivery-plan-receipts`；独立核实main为
`996dfedc12da3527343cd3ff2aa5eea35497e10e`，干净输入
`d59a05e0e7fe5540322485c39a6756a9ba81ab6f`。root唯一writer，既有
server_convergence_review只读复审。无继承dirty；这是D-147已批准Server收敛中的
可靠命令工程，不修改D-100交期所有权、数量、日期或Source业务规则。

保留原PATCH及`{deliveryPlanSet}`成功契约。新增可选UUID requestId；旧body通过
actor/原SO/规范化完整命令确定唯一请求，不生成随机旧请求身份。两类请求进入同一
writer和不可变回执关系。请求在首个await前复制为固定shape，显式与legacy key分
namespace。相同请求返回原完整结果；不同显式请求仍受原集合CAS保护。

新增只读POST receipt核对入口，提交原完整命令。fresh user/roles/grants与原
actor/SO/命令必须匹配；不重跑当前CAS、Source或历史alias资格以否定已提交结果。
unknown仅表示当前没有已提交回执，不证明原请求失败，不能据此自动重发。

## 事务与安全边界

前向0042新增空技术ledger，不重写旧迁移或回填历史。执行锁序为现有有效归属共享
fence → fresh actor/role/grants → actor/request → prior → 原SO及集合；不引入生产
全局锁。首次执行仍只写原有效SO，不跟随sourceOwner修改历史alias。

计划、可信审计与成功回执同事务提交。仅writer明确的稳定409/422保留拒绝结果；
SQL、审计、锁超时或连接错误全部回滚，不伪造终态。完整结果的紧凑JSON与PG jsonb
实际字节均受16MiB上限保护，超量时SAVEPOINT撤销计划和审计，保存明确422；命令
64KiB上限。100行是单次受影响行限制，不截断既有/作废计划历史。新SO外键纳入完整
引用指纹。旧schema调用不保留无回执写旁路。

旧PATCH调用、默认行ID、Source null/0、永久人工所有权、原root锁顺序和当前生命周期
行为保持。本阶段无UI、金额、CCT、生产、Source读取或真实业务库操作。现有环境、
账号、Browser及卷不启动、停止、升级或删除。

## 验收计划与当前状态

实施前只读review已通过接口方向；实际代码静态复审未发现P1/P2。已完成显式/legacy
原结果重放、不同ID CAS竞争、输入隔离、撤权/归档锁等待、COMMIT后丢回复、历史alias
核对、完整结果容量回滚、审计故障、immutable/FK引用、0041→0042保留数据、启动
verify-only与HTTP边界，当前定向42/42通过。旧0008→0009测试保留原字节与空集合断言
后再前向升到当前。新增真实root锁超时、不同actor同UUID、显式并发、252行完整成功
回执及完成/取消生命周期兼容测试。首次失败为合成角色名称唯一约束，已用唯一测试名
修复；第二次HTTP缺单测试复用了已消费requestId，按真实契约先命中409身份冲突，已改
用新requestId验证404；没有为测试改变接口优先级。实际容量、回滚及原root锁测试一直保留。

最终receipt19/19、bound-refresh18/18、有效归属45/45、归一只读40/40、完整归一证据
33/33、全PostgreSQL270/270、typecheck、全lint、Node/前端build已通过。全项目首轮
910项中899通过、11失败，全部为D154尚未前向绑定而触发同一
`EVIDENCE_WORKTREE_DRIFT decisions-garment-observations-20261021`，原日志保留于ignored
outputs/delivery-plan-receipts/project-tests.log。须先提交新文档blob并绑定前向版本，
再重跑全项目/116发布/精确main守卫；当前不能称全项目或最终门禁PASS。

源码checkpoint为`12cfaf18867fea94f6733389851191afc29f31a4`。D154前向记录已绑定此
提交的实际Git blob，原261条证据逐对象保持不变。随后全项目**927/927**通过
（197456.008ms），首次失败日志不改写。当前working守卫也PASS（main996、源码12cf、
11pages/55能力/80继承UI路径）；这不替代最终提交守卫/单独发布回归或新运行验收。
固定源码只读review无P1/P2，未让reviewer冒称执行测试。完整冻结范围和实际检查见
[后台工程证据](../completed/2026-10-22-delivery-plan-request-engineering.md)。

完成后记录实际测试、精确commit/远端/CI和remaining dirty。当前尚未交付，不合并、
关闭PR、部署、采集、切换旧入口或修改真实数据。完整Goal仍active。
