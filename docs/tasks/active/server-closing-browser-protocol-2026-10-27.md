# Gate8E1：Server关账浏览器契约

2026-10-27；branch codex/server-closing-browser-protocol-main-869e，clean阶段基点e5f4d2350e545628761bf6da7f41245f9d49b43c。沿用同日核实main869ee84dd0b31de6161011e4aa560678b244a64d，无fetch/API；原PR130 head61704afe22fe9fd0ea9f6625c6092fcbb9575dfc不代表本阶段，Git/ref写STOP根因UNRESOLVED。

复用原contract/read-query，增加原receipt hash验证、历史范围/ISO、白名单client与单actor/tab临时pending；不新增价格、税率、schema或关账系统，不接DOM/controller/provider/导航。只扩展原closing测试命令，无新workflow/job。[当前契约](../../features/SERVER_CLOSING_INTERFACE.md)、[冻结工程](../completed/2026-10-27-server-closing-interface-engineering.md)。

S1 48a41fb6957c7353415e690863af48ec704c9a2e：全3072blob/0overlay owned archive，82受影响、811项目、lint、Server/前端构建通过；类型三处失败原件保留。S2 45a5b087b4b3ed19ae448188257146a516d75bf4只改两文件类型收窄和集成测试：新全3072blob archive上38（15契约＋15client＋8HTTP含父）、类型/lint/Vite通过，未重复811/构建，不相加。S2真实直接父S1，原source-corrected.parent仍为阶段基点，lineage.json澄清且原件不改。

HTTP真实执行原九类命令、手工税/量、CNY/USD独立汇总、加工0USD、历史版本、权限撤回和COMMIT后丢回应。两项独立复审P2已修（颜色联合行上界、歧义只读阻断），0剩余P1/P2。WIP29/6和早期lint失败保留，不挪作精确S2结果。本阶段未重跑144发布负控；最终收口仅跑一次精确main守卫，真实完整HEAD/结果存本机final.json；后续交付前必要完整门禁不省略。

[页面草图](server-closing-ui-proposal-2026-10-27.md)具体批准pending，原USD采用UI问题仍pending。没有实际浏览器像素/交互或可体验声明。274旧本地ref和50/179/27 Docker标识保持（非内容审计），新owned tmpfs合成PG已按夹具回收。0远端写/Hosted/Source/既有库账号/合并/部署/切换/退役；68项能力不变，完整Goal active。原件在outputs/server-closing-browser-protocol-20261027。
