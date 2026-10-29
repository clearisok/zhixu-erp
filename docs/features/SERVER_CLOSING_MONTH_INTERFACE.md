# 年度读取与关账调月客户端（Gate8G2d）

2026-10-27，承接D169–D172及已批准修订UI；只接现有服务协议和可复用客户端，不在本片挂载正式页面。

## 唯一服务与HTTP

现有closing路由增加`GET /orders/:id/month-plan`、`POST /month-plans/preview`、`POST /month-plans/commands`、`GET /month-plans/commands/:requestId`。仍在`/api/v1/closing`下，session-only、fresh RBAC、可信Origin/header、16KiB请求限制、原服务锁/CAS/幂等/审计/冻结与原回执；不新增第二个数量写入器或SQL迁移。

原`createClosingClient`增加年度与月份方法，复用有界UTF-8 JSON、no-store、include-session与owner lease。年度严格验证12个月、显式year/scope/生产状态/且搜索、同范围未分页合计与分页明细、金额权限、未知/零和当前参考/冻结依据。调月状态没有金额；预览复用现有纯move/match规则核对颜色/执行方/月量及完整整单集合，不按筛选后的可见行拼造整单。

## 同一原请求恢复核心

旧financial controller公开调用与原pending v1 key/envelope保持。生命周期提取到`closing-command-controller`，月份controller仅提供既有领域parser、物理SO上下文、权限和回执适配。两者共用保存并读回后POST、只读核对原ID、unknown证明后用户明确原ID重试、终态后释放、超时/dispose/身份ABA阻断晚结果等状态机。

月份独立请求地址`zhixu.server.closing-month.pending.v1.<userId>`只存原命令，不是Browser账本、自动重播队列或新价格系统。恢复构造不联网；刷新不POST。损坏/未来结构/写入后读回失败保留原字节并阻断新提交。身份、权限或页面上下文变化要建立新owner；旧owner不能释放原请求或影响新登录。写权撤销后仍可用读权限核对原回执，读权撤销则不展示旧状态。

整单服务仍按完整物理SO读取，包括界面可能隐藏的外发/其他月；部分快照、未分配与执行匹配保持独立数量规则。调月不改Quote/PV/CCT、价格、工价币种、税率、生产或出货；月财务显式采用继续走原D171协议。旧手工财务入口尚未整体退役，已有linked防重保护不变。

## 验证与边界

合成owned PG/HTTP验证真实并发、回执丢失、actor隔离、冻结/旧权限、执行匹配和金额投影；共享旧控制器回归覆盖超时/丢失/撤销/ABA。具体结果见[阶段](../tasks/active/closing-interface-current-2026-10-27.md)。此片没有DOM/CSS/导航变化、实际页面像素/用户接受、500订单压测、Hosted、远端交付或镜像恢复结论。

不回退Browser，不改旧key/种子/用户数据库、真实账号、Source或旧环境。不合并部署、切换退役；独立USD采用UI未在本批准范围。保留原Git/ref STOP与完整Goal，正式Server owner页面随后实施。
