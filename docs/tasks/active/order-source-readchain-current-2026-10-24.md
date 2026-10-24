# Gate4A：保存的订单来源读取链向当前 main 前移

2026-10-24；root 唯一 writer，现有一个独立只读 reviewer。GitHub只读API于05:10:34Z重新核实
main `e01a11952b648024c0bd6bf4259de429374981e2`。从该main新建
`codex/order-source-readchain-current`，显式快进到加工保护收口
`785cbfad9b4788be09dd06beef3f73bdabf8fcbc`，开始clean；该前序精确main守卫PASS，
保留两个前序任务分支，不改其提交。起点和完整路径清单保存在ignored
`outputs/order-source-readchain-current-20261024/{start,forward-scope}.json`。

## 复用与范围

本阶段仅复用原16f→`a1879b70dde94d9670f33da476732157e48c9443`已验收Gate4A的11个
server/features文件。逐路径先核原16f与当前785的Git blob完全相同，新路径不存在用户文件，
再前向复制；不是以旧整文件覆盖当前修复。#120价格汇总/加工来源保护不在该差异，保持原样。
不导入旧workflow、共享摘要、release清单或原日期的工程通过标签；新增一个稳定npm验收入口。

- 可信BillNo和来源ID精确关联后，只将已保存6087105颜色/尺码证据白名单投影为typed DTO。
  保留slot顺序、重复名称、空位、quantity pending/null/显式0及原matrix状态；不从部分allocation
  重新推算完整尺码有效性，不丢弃仅matrix异常的有效颜色，不推算过期时间。
- 原始metadata、额外字段、凭据、hash、价格不返回。加工为not_applicable，旧缺失为unknown。
- 读取选择精确mirror对应link；多个不匹配的历史link不猜选，额外历史link不复制订单/计划结果。
  DeliveryPlan source比较必须满足exact mirror/source link；自有计划/版本/数量不变。
- 客户端只增加一个既有DeliveryPlan GET helper，credentialed/no-store，401/403/404等保持typed，
  不加PATCH、自动重试或Browser fallback。订单detail与计划仍是独立请求/快照。
- 只增加DTO/只读helper，没有4B页面展示、4C交付计划编辑、schema、来源采集/刷新、商业写入、
  新权限、导航或密度变化；两个前端TS路径有精确e01a的V0影响记录。

## 验证与边界

冻结后用owned空PG、合成角色与loopback API验证纯投影、GET客户端和来源链；并核既有
DeliveryPlan、有效归属、加工批次、首次绑定/物料读取、PG foundation/API受影响回归。
完成full types、Node编译/import、lint及最终精确main守卫。旧a187的24/70/927/116等结果
仅是历史证据，不算本次；前端无组件变化不重建/重跑已通过87/66浏览器。

#125仍CA草稿，4f精确API例外待答复；不push/ref/PR/CI/merge/close/deploy。
所有旧环境、数据库/卷/备份/对象和业务身份保留，不安装、不读凭据或新增真实Source请求、
绑定/激活/调度，也不退役任何入口。G4A通过不能代替4B显示或生产/出货/关账闭环；Goal保持active。

## 冻结源码与实际结果

冻结 `c77ddc9f0746b5e2e4ebd271bca8b9d57b5c1d7f` 的新canonical archive已运行：

- full typecheck PASS（22691ms）；Node compile + compiled app实际import PASS（11709ms）。
- full lint PASS（37770ms）。
- 9文件组合 **103/103 PASS**（76441.3985ms测试、76835ms进程，含父项，0fail/cancel/skip）。
  新纯证据/客户端/来源HTTP链与既有DeliveryPlan、有效归属、加工批次、绑定/物料、PG foundation、
  order-business-source一起核验，保持颜色商业身份与#120修复。
- HEAD/237清单稳定，owned fixture正常清理；`qa-context.json`、`qa-results.json`和日志保留在上述ignored目录。

API fixture沿用ca53静态文件仅供既有HTTP构造，不是当前前端构建/页面验证；4B累计构建与实际浏览器
仍待下一切片。没有将a187的历史24/70/927/116标成新结果，未重跑未变的87/66浏览器或134发布。
独立源码与终态日志复审无新增P1/P2，仅只读核对，不代跑测试或访问真实Source。
后续仅元数据checkpoint并运行一次精确e01a守卫，以ignored `exact-main-guard-result.json`
的完整checkedHead/状态作为最终校验事实，不反复运行本阶段已通过的检查。
