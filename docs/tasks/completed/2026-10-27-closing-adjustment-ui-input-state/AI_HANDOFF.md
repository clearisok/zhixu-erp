# 恢复点：Gate8G2d关账严格客户端与原请求协议

2026-10-27；branch `feat/order-closing-month-plan`，clean输入4525a74c554a77a70a74277fad5d88d49a1767ed，核实main869ee84dd0b31de6161011e4aa560678b244a64d本地对象/祖先可用。无fetch或远端写，原STOP未定；PR130旧head不含增量。

先读[本片契约](features/SERVER_CLOSING_MONTH_INTERFACE.md)、[阶段](tasks/active/closing-interface-current-2026-10-27.md)及D169–D172。新HTTP：orders/:id/month-plan、month-plans/preview、month-plans/commands、month-plans/commands/:id，都复用既有服务。client新增year/month方法，严格验证完整性/量/权限/owner；financial与month controller共用closing-command-controller。旧financial pending key/envelope保持，月份key为zhixu.server.closing-month.pending.v1.<userId>，只原请求地址，无自动重放或Browser账本。

协议范围69/69；独立复审指出年度basis双向绑定、月/年计数阻断和既有小计关联两项P2，现都修并由受影响13/13验证，最终只读0P1/P2。不把旧69冒充修后全跑；初版TDZ/generic类型/测试union和负控别名12/13原件保留。规范副本仅最后测试fixture前向替换后补根类型，runtime/Server构建不变；14输入绑定、lint、源码与exact HEAD守卫看本片final.json，不借旧Gate结果。

下一片正式Server owner页面；勿直挂Browser closing/order/production hooks。已批准修订UI无需再问，整单预览包含当前隐藏范围，scope/year改变使预览失效；原请求恢复构造不fetch/POST，unknown需用户明确原ID重试，当前session/权限/上下文新owner阻断晚结果。Quote USD采用UI独立pending。旧手工入口尚未整体退役，Source/归属更正、新镜像非空回执恢复和实际浏览器后再改能力。

本片S aba4719038b0de05804a397c44f49e32a6fc9162；[冻结工程](tasks/completed/2026-10-27-closing-interface-engineering.md)逐项记录类型/构建、14输入与失败保留。清单538→539仅新契约，精确main守卫留到正式UI累计收口，本片不称新PASS。当前68能力不变，Goal active。0真实Source/现有账号业务库/远端/Hosted/合并部署/切换退役；保留3001/50426/59069/62426/18443/18444、Browser数据、旧卷和备份。G2c S bdfc531b/Q4525守卫PASS仅属其独立工程。
