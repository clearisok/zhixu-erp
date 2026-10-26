# 当前状态：Gate8D2 USD采用原请求控制器

2026-10-27；分支codex/usd-labor-controller-main-869e，clean父3d727b46c17b8f02dfc8952804c47771621ab295。最后核实main869ee84dd0b31de6161011e4aa560678b244a64d沿用本日既有API读取，无重复fetch/诊断。PR130最后head61704afe22fe9fd0ea9f6625c6092fcbb9575dfc只代表原阶段；原Git退出1的STOP_AUTH_OR_DIVERGENCE根因UNRESOLVED，远端Git/ref写继续冻结。

D162/D164 CNY→USD与产品/售价/批次/关账保护不变。D165查询协议在[Gate8D1](tasks/completed/2026-10-27-order-usd-labor-interface-validation.md)验收；D166本阶段补原请求控制器：完整存储读回→POST→原GET核对→终态释放，以及ABA/超时/撤权与显式原命令重试。[契约](features/ORDER_USD_LABOR_INTERFACE.md)；[当前阶段](tasks/active/usd-labor-controller-2026-10-27.md)。

初次20单元通过；lint一处和review两项P2已修。精确新源码的定向/真实HTTP、编译、终审与守卫尚在进行，不借父41/811/144预报PASS；旧失败和证据保留。无新schema/API/金额模型或Hosted job。

USD三步UI仍待用户答复，未接DOM/CSS/真实session hook/导航拦截，不能称可体验。Server关账UI、税率更正、远端交付和目标切换未完成，完整Goal active。0Hosted/远端写/真实Source/现有库或账号/部署/切换/退役；273条旧ref与现有环境保护，不重复无变化全仓测试。
