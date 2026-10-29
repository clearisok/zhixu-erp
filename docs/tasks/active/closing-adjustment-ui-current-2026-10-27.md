# Gate8G2e：关账调整正式接线与实机演示

2026-10-27；branch `feat/order-closing-month-plan`，clean输入cf96ae106d6d2c0c4ce324548bf00d8f35d48c98；核实main869ee84dd0b31de6161011e4aa560678b244a64d，无新fetch/远端写。批准见[原记录](../completed/2026-10-27-closing-adjustment-ui-approval.md)；不重复询问。

已接全年两项、同范围过滤/分页、部分整单调月、两项受影响月参考、原月份生命周期与独立原请求恢复。初版类型错误及窄复审发现的恢复可达性、输入卸载、历史执行方取名、401/403和未触及月份重算均修正；原件留在outputs/closing-adjustment-ui-current-20261027。

当前检查：scoped lint 0错误/警告；真实PG参考测试1/1，覆盖精确价/税率、未触及月份排除、缺税未知、CNY工价阻断、零工价、不适用及权限。该参考测试的十二月未真的锁定，不能将其称新的同单冻结全链验收。规范副本3165输入，根类型37054ms、Server构建13252ms均PASS；只读窄复审0 P1/P2，不代表其运行过测试。正式built Chromium及累计守卫仍待执行，不预报。

源码bd7fef68589fb84bec6625912f7597d6e18d1b3a的实际构建浏览器9/9通过，覆盖1440/390、失去回执/原请求/撤权和输入焦点。首次短路径ADMINI~1构建退出0却未导出页面，浏览器正确失败；同源码改用Windows完整路径后无此错误、页面完整，不改共享配置。两次日志均保留。截图检查后仅前向修表单控件尺寸和月卡密度，几何需再核，不将旧9/9冒充样式修后结果。

最终CSS源码4107aea1ebf181265b543ad4c25a8afe1168f886重新构建及actual Chromium9/9通过；独立窄复审0P1/P2。新的本机隔离演示已启动并经可见UI实际保存：SO1外发10件2月→11月，全年外发2000CNY/50USD不变。[冻结工程](../completed/2026-10-27-closing-adjustment-ui-engineering.md)记录逐源结果和限制。

累计main869ee84dd0b31de6161011e4aa560678b244a64d源码守卫PASS：checkedHead970aba6c39d59d6b9e1f4e58df5a46f619be0d98加本片清单，12页/68能力/83累计UI路径，0错误。545证据保留旧539，仅新增本片契约、批准、工程和3张合成截图；Server静态上限21→23但仍由默认disabled/snapshot及fresh权限控制。响应式回归20/20，最终构建992个runtime输入与当前源码字节全匹配。清单随后原样提交，不把元数据提交冒充另一次守卫运行。

本片为本机体验，不进行PR交付；未重复G1完整发布144、整仓811或Hosted。下一次PR交付前仍须相应完整发布基线及必要合并检查，不以这次局部/源码结果替代。匹配UI、USD采用UI及其余Goal不称完成；用户人工业务接受尚未取得。

REMOTE PENDING，PR130旧head未变化；不触发付费Actions、merge或部署。旧体验环境/Browser/卷/备份全部保留，演示只新owned合成库及端口。
