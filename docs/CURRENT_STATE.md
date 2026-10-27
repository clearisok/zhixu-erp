# 当前状态：正式Server关账调整UI

2026-10-27；branch `feat/order-closing-month-plan`，G2e clean输入cf96ae106d6d2c0c4ce324548bf00d8f35d48c98，main869ee84dd0b31de6161011e4aa560678b244a64d本地已核实，无fetch/远端写。PR130旧61704afe不含本地新链；原Git/ref STOP未解。

已按[具体批准](tasks/completed/2026-10-27-closing-adjustment-ui-approval.md)接入Server owner：全年12个月只列成衣CNY与加工USD；筛选同步明细汇总，生产仅参考，部分/整单调月完整预览，固定底栏；当前采用价只对涉及月作只读差异，不重算无关冻结月。默认Browser路径保持，Server只在snapshot显式候选开放，无Browser回退。

金额/数量未知不补0，税率显式空值确认；共享原请求controller、actor缓存、CAS/幂等/回执与冻结边界复用。刷新/撤权后的恢复入口独立于可见SO及编辑权限。401失效session、403清旧金额；范围/身份变化不接纳晚响应。[契约](features/SERVER_CLOSING_ADJUSTMENT_UI.md)。

当前为源码候选，真实构建、浏览器与累计发布守卫结果见[阶段](tasks/active/closing-adjustment-ui-current-2026-10-27.md)及outputs/closing-adjustment-ui-current-20261027；未取得不预报。G2d协议69及修后13、G2c守卫PASS仍仅各原阶段，见[输入归档](tasks/completed/2026-10-27-closing-adjustment-ui-input-state/README.md)。未跑Hosted或新真实Source。

只准备新owned合成演示，不重置3001/50426/59069/62426/18443/18444、Browser、卷或备份。执行方匹配由合成服务预置，本片无匹配UI；USD采用UI、旧手工入口整体收紧、Source更正和新镜像恢复仍后续。68能力不提升，Goal active；不自动合并、部署、切换或退役。
