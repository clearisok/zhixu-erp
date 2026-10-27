# 恢复点：Gate8G2e正式关账调整UI

2026-10-27；branch `feat/order-closing-month-plan`，clean输入cf96ae106d6d2c0c4ce324548bf00d8f35d48c98；沿用核实main869ee84dd0b31de6161011e4aa560678b244a64d，无fetch/远端写，原STOP未解。

用户明确批准修订草图且最新要求尽快本机实演；不要重复审批或先扩后续范围。[UI契约](features/SERVER_CLOSING_ADJUSTMENT_UI.md)、[阶段](tasks/active/closing-adjustment-ui-current-2026-10-27.md)、[批准](tasks/completed/2026-10-27-closing-adjustment-ui-approval.md)。Server authority selector先选owner再挂Browser hooks；新page复用year/month/financial现有服务和controller，两个独立pending地址仅原请求，不自动POST。

当前范围含全年两项/同范围筛选、部分整单完整调月、只读受影响月两项差异、月份税率空值显式确认/采用/确认/锁定/重开，以及独立原请求恢复。未分配不默认内制，冻结无关月不重算，金额权限和owner阻断保持。Executor名称以保存basis及精确资源hash取名，变更后用历史提示。

修后类型/Server构建、引用测试、actual built Chromium和发布守卫以本片outputs及冻结工程为准；未取得不报PASS。首次类型失败和失败浏览器原件均保留。测试fixture只新owned PG、独立Chrome profile/127.0.0.1端口，JS输入持续焦点、丢失回执/撤权恢复和390px几何必须实测。构建完整SHA绑定，不测试旧dist冒充新UI。

执行方匹配UI未接，演示预先经服务匹配；独立USD采用UI仍pending。旧手工入口退役、Source更正及镜像非空恢复另Gate。旧共享状态[归档](tasks/completed/2026-10-27-closing-adjustment-ui-input-state/README.md)。不重复旧全套/Hosted、不碰旧环境/真实Source/账号业务库/合并部署，68能力不提升，Goal active。
