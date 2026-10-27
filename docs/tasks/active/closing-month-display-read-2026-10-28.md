# 关账月份复核的只读名称与期间状态

2026-10-28；branch feat/order-closing-month-plan，clean输入80398cb2e53bfbb7b167a2fd473841d1140789e9；沿用已核实main869ee84dd0b31de6161011e4aa560678b244a64d，无fetch或远端写。上一片已完成发布工具工程；本片推进已规划的非金额读取缺口，不借自动Goal续行批准三处新UI。

## 范围

复用原订单月份GET，显式单一查询view=display才扩展返回；原无参数GET、年度聚合及其严格客户端字节结构保持。session/fresh CLOSING_READ权限、同一REPEATABLE READ READ ONLY事务包住计划、可信当前Source、不可变颜色身份、资源快照和完整所涉期间状态，不增加写命令、表、自动初始化或Source请求。

display.schemaVersion为server-closing-month-display.v1，meaning明确是非金额参考而非冻结财务快照。颜色同时保留不可变identityName与当前currentSourceName；当前缺失/歧义不选第一条，不把当前名冒充历史名。执行方以assignment/hash/type/executor完整键关联；从已有不可变resource facts精确hash/id/kind提取name，不读当前基础资料代替旧快照，不返回电话/备注/成本。无法找到快照明确null/missing_snapshot，坏证据503。涉及月份包含全部计划行及创建defaultMonth，未创建期间显式null/not_created，不猜税率；既有财务冻结名称和金额完全不变。

源色2000、颜色身份4000、执行依据1000、月份2001有界；先SQL核对所需资源facts总bytes不超过8MiB再载入，输出1MiB，不截断。新客户端严格核对同单全部颜色、执行依据和月份集合；独立monthDisplay方法只读、不持久化，不增加金额权限或改变原请求/预览hash。没有正式DOM/导航/布局变化，三条UI辅助路径记V0。

## 当前验证与真实失败

模型4项、严格客户端2项通过。初次PG/HTTP6项中4PASS/2FAIL（含父测试失败）：测试误以为基础资料改名后，同一执行方的排单更新会刷新旧资源快照；实际生产规则保留旧快照，未修改该业务规则以迎合测试。原integration.log保留。用明确更换未开工执行方建立新快照后，补真实并发屏障：读取暂停在名称查询后，另事务改Source拼写并新建期间，原读取仍返回同一旧快照，下一次读取才见新状态。修正后7/7，具体耗时见原日志，不挪用上一片168或镜像9/9。

尚待规范提交源码的类型/lint/构建、相关回归、最终发布门禁和工具片外的独立复审。没有新实际页面验收或新镜像恢复声明。私密outputs/closing-month-display-read-20261028保留start、容器名前后、model/client/integration与修正原件；仅新owned一次性PG，旧61104及用户预览、3001/50426/59069/62326/18443/18444、Browser、卷/备份保持。Hosted0、无真实Source/既有账号业务库/合并部署/退役；Git/ref STOP根因未解。

旧执行归属漂移仍明确409，不擅自增加更正写规则或声称恢复闭环完成。具体UI仍待人类批准，核心关账调整已批准不能重问。完整Goal继续，当前读取切片完成不等于全项目完成。
