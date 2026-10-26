# 当前状态：Gate8D2 USD采用原请求控制器

2026-10-27；分支codex/usd-labor-controller-main-869e，clean父3d727b46c17b8f02dfc8952804c47771621ab295。最后核实main869ee84dd0b31de6161011e4aa560678b244a64d沿用本日既有API读取，无重复fetch/诊断。PR130最后head61704afe22fe9fd0ea9f6625c6092fcbb9575dfc只代表原阶段；原Git退出1的STOP_AUTH_OR_DIVERGENCE根因UNRESOLVED，远端Git/ref写继续冻结。

D162/D164 CNY→USD与产品/售价/批次/关账保护不变。D165查询协议在[Gate8D1](tasks/completed/2026-10-27-order-usd-labor-interface-validation.md)验收；D166本阶段补原请求控制器：完整存储读回→POST→原GET核对→终态释放，以及ABA/超时/撤权与显式原命令重试。[契约](features/ORDER_USD_LABOR_INTERFACE.md)；[当前阶段](tasks/active/usd-labor-controller-2026-10-27.md)。

本阶段分源通过38项定向/真实HTTP及22项修复后控制器检查，类型/lint/前后端构建与Vite浏览器编译通过，独立终审0剩余P1/P2；两轮lint失败原件保留，计数不相加。[冻结工程](tasks/completed/2026-10-27-usd-labor-controller-engineering.md)。最终精确守卫随后单独记录，不借父811/144冒称本阶段。无新schema/API/金额模型或Hosted job。

USD三步UI仍待用户答复，未接DOM/CSS/真实session hook/导航拦截，不能称可体验。Server关账UI、税率更正、远端交付和目标切换未完成，完整Goal active。0Hosted/远端写/真实Source/现有库或账号/部署/切换/退役；273条旧ref与现有环境保护，不重复无变化全仓测试。

S2 2c9e321c5a5d0e6ddca85f90f7348c07de955eda；工程Q 9d287e738d38a9d2a25bfb86a7e74698a29f7be7，清单525证据/68能力不变。最终提交精确守卫以本机final.json为准，不预报；[验收收口](tasks/completed/2026-10-27-usd-labor-controller-validation.md)。
