# Gate4 历史订单与Source界面：冻结工程结果

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；本地feat/order-effective-attribution，从2f134319316e46ef54ff570d5fe5f4bdb0ea0b73/clean继续。实际渲染源码c20904d9df1062ff195da45f3811f881b7d16cc0，buildId order-source-history-20261015-c20904d9，buildTime 2026-10-15T05:26:46.2835400+08:00。本报告/PNG记录SHA由manifest绑定，renderedSourceSha独立绑定c209，不伪造同一时点。GitHub为实时事实源，本文是阶段快照；下一次变化出新证据。

## 具体实现与批准范围

批准D121计划明确有效/历史列表、原身份及流水保护和统一有效归属。现有Toolbar/DataTable/Card/Modal加有效/含历史筛选、原SO历史重复标记、显式有效SO链接、历史单新认领/改价关闭，以及原捕获SO/run的历史物料Modal；案件选单显式包含原历史SO。没有新主导航、其他模块改版或生产路由。9精确UI路径在docs/release/ui-changes/order-source-history-ui.json；批准范围工程摘要为order-identity-program.md，不能当作这些新截图已经获得用户人工验收。

历史子DTO不兼容当前ready标记，客户端拒绝错SO/run/当前状态/不完整旧context等响应。每次history GET是session/no-store，错误无Browser/当前来源回退。列表scope按筛选/用户/授权隔离，旧晚到响应不覆盖新范围；关闭Modal取消请求并清空记录。理论需求/实际采购独立，unknown/0、空单位和冲突保持；原事件逐项，未跨物料/单位/两SO求总量，不认定齐套或实际付款。

SQL、正式API与权限逻辑未改，本阶段仅合成fixture注入已有history reader；原SO、Source link/snapshot/profile、商业版本、交付计划和案件逐表读前后相同。翻单准备可引用原历史SO，仍不创建SO。加工类没有待关联艾诺科提示。后端有效owner/价格保护与fresh grants保持，界面隐藏不替代API守卫。

## 实际验证

精确c209无缓存typecheck、完整lint、client6/6、根源码824/824、实际静态构建均明确exit0。9/9精确built browser使用真实合成HTTP session/一次性PG，覆盖默认有效列表/显式历史、实际延迟响应、案件原历史选单、原UUID/价格保留且关闭认领采用、原捕获快照/四流/无ready判定、显式当前root导航及独立历史、390不溢出/关闭真实AbortSignal、fresh ain.view撤销清空数据。浏览器/Server均无异常，业务请求无POST/PATCH/DELETE，逐表结果相同。

此前同一UI候选的既有身份5/5、商业4/4、案件5/5回归通过；只有最后三处长文本换行样式在精确c209重新验9项。上阶段Server历史17、有效归属45、身份15、Source20+skip1/持续43+skip1、全PG261的冻结证据仍保留其6bc阶段时点，不能称本轮重新执行261或真实DB验收。

## 图片对照

五张为新路径、全合成信息，已逐张实际查看。1440列表/原详情和390原详情保留既有主题/列/页面组件；historical提示与有效单链接明显，原UUID没有跳转。Modal在1440显示数量表、390沿用记录卡，仅Modal滚动，不造成page水平溢出。需求100与实际采购40/100/0/unknown、0需求分别展示，无“已齐套”结论；原采购事件保留。

- [含历史列表1440](screenshots-c20904d9/history-list-desktop.png)
- [原身份详情1440](screenshots-c20904d9/original-detail-desktop.png)
- [原身份详情390](screenshots-c20904d9/original-detail-mobile.png)
- [原来源历史1440](screenshots-c20904d9/original-source-history-desktop.png)
- [原来源历史390](screenshots-c20904d9/original-source-history-mobile.png)

既有大返回按钮、概况重复编号、侧栏退出Server等用户已批准后续调整仍属G5，不借本轮历史UI改动擅自重设计。图像是工程验证，不是自动像素基线替换；旧PR64/P6/后续截图与hash均未覆盖。

## 失败记录与未完成状态

首轮历史9项5PASS/4FAIL、第二轮6PASS/3FAIL因宽泛文本提前满足、异步列表未就绪与后置fetch替换无效。加载前统一网络控制后实际延迟/取消通过，正式精确9/9；未用空等待或修改产品保护绕过。旧商业回归曾过早点击仍加载中的认领；改为等待可操作按钮后4/4。类型/lint/构建失败未隐藏。

implemented=yes，仅上述history UI；isolatedTest=passed-historical（c209合成实证）；merged=false，REMOTE PENDING，没有新PR或远端CI；humanAcceptance=not-run；sourceActivation=not-applicable（只读历史界面不激活来源）；18443/18444=not-deployed，旧source/image identity未重查/改动。

剩余独立生产财务复核/默认关闭执行可见原因、完整G4/PR交付、准备采纳/历史类型hold/规格修订清确认及G5。真实Adapter/归一permit、备份恢复/账号/数据库、来源范围/窗口、宁波/18443/18444仍未获扩大授权/未操作。网络规则保留，恢复push仍待此前一次具体授权。最终release-baseline结果按前向绑定后另在active任务记录。
