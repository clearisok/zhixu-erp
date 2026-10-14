# 当前接力：Gate4只读归一证据核心

2026-10-14；分支feat/order-normalization-preview，父提交39c9f7b607eabed5d72845d3a30b7fc766a6ee9d，起始干净。main最近核实064e3afaf7d08b3cb62907d4402f97d9c292f1e5，本轮未刷新。G1–G3本地依赖保留，未声明远端送达。

已核对Server引用与Browser生产/关账边界，新增内部纯评估核心及8项回归通过，定向lint通过。未开放HTTP/执行命令，未连接真实DB或Source。下一步实现事务一致只读引用采集、权限/API及合成PG验证，之后案件与独立执行工程；不能把本阶段当Gate4完成。

详见[Gate4任务](tasks/active/order-normalization-preview.md)。Gate3最终接力完整保留于[归档](tasks/completed/2026-10-14-gate3-final-handoff.md)。NETWORK_DEGRADED规则未修改，不重复push、不自动执行恢复命令。没有真实账号/DB/部署/调度范围变化；不自动合并。

后续checkpoint：只读采集器已实现，固定引用查询、repeatable-read只读事务、受信管理员与fresh order.view；一次性PG7项通过。reviewHash仅为有限引用摘要，不是执行token。HTTP接线与完整引用/案件执行仍未完成。

HTTP只读预览已接POST /api/v1/order-normalization-preview，严格双UUID/无额外字段、可信session、Origin/请求头与2KiB；PG/HTTP8项和定向lint通过。新增test:order-normalization脚本。尚无案件持久化、UI或归一执行；下一步案件管理及有效归属/纠正设计与隔离验证，不将只读API视为整个Gate4完成。

0017案件/事件schema已新增并在一次性合成PG验证；只允许追加opened/review_note/withdrawn/reopened，不改变有效归属。固定引用清单已识别案件两端。test:order-normalization 22/22通过。下阶段实现案件服务/API、服务端快照与幂等审计；不提前宣称Gate4执行能力完成。
