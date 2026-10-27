# Gate8G2e：关账调整正式接线与实机演示

2026-10-27；branch `feat/order-closing-month-plan`，clean输入cf96ae106d6d2c0c4ce324548bf00d8f35d48c98；核实main869ee84dd0b31de6161011e4aa560678b244a64d，无新fetch/远端写。批准见[原记录](../completed/2026-10-27-closing-adjustment-ui-approval.md)；不重复询问。

已接全年两项、同范围过滤/分页、部分整单调月、两项受影响月参考、原月份生命周期与独立原请求恢复。初版类型错误及窄复审发现的恢复可达性、输入卸载、历史执行方取名、401/403和未触及月份重算均修正；原件留在outputs/closing-adjustment-ui-current-20261027。

当前检查：scoped lint 0错误/警告；真实PG参考测试1/1，覆盖精确价/税率、未触及月份排除、缺税未知、CNY工价阻断、零工价、不适用及权限。该参考测试的十二月未真的锁定，不能将其称新的同单冻结全链验收。规范副本3165输入，根类型37054ms、Server构建13252ms均PASS；只读窄复审0 P1/P2，不代表其运行过测试。正式built Chromium及累计守卫仍待执行，不预报。

下一步把源码checkpoint绑定完整构建SHA，执行1440/390实际浏览器、失去回执/原请求/撤权和输入焦点，再启动独立本机演示。累计main守卫与必要发布基线收口独立记录；不重复旧整仓/Hosted。匹配UI、USD采用UI及其余Goal不阻塞这次演示但也不称完成。

REMOTE PENDING，PR130旧head未变化；不触发付费Actions、merge或部署。旧体验环境/Browser/卷/备份全部保留，演示只新owned合成库及端口。
