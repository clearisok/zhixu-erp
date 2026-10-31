# 导航修复已交付：页面代码预载与报价列表拆分

## 当前交付状态（2026-10-31前向补记）

产品与最终交付源码17c20e111e8ec66e21b9309616b3baab28cbc8de，base/main e37a131a7182a5488f440dcc8fde3ea66de1c6e4。PR138仍草稿且未合并，精确17c已一次推送并核实；Release baseline 41150962542、First team access 41150962547、Ainuoke server source 41150962566均首次SUCCESS，无重跑/手动触发。独立只读审查未发现新增P1/P2，本补记修复其P3过期接力问题；旧交付前全文见[逐字归档](../completed/2026-10-31-navigation-delivery-input-state/navigation-performance-2026-10-31.md)。

授权的staging更新已完成：精确镜像sha256:85200578e877c5d22ea92c48c56df07bebe7b623ede349f682e9c528cc976263；新配对备份、121表/序列独立恢复、34路径读回及保留审计通过，旧账号/业务/附件/容器/卷/路由保留。实际浏览器单样本报价→订单1437.6ms、订单→报价1506.8ms、订单→进度设置2172.9ms；各1次RSC、0次重复auth/me。计时为首个页面请求至主要数据响应，非完整交互绘制或长期速度保证。报价列表的一个旧合成附件缩略图仍503，D1992缩略图200；不冒称所有网络请求无错。

回执：outputs/navigation-completion.json、navigation-ci-final.json、navigation-browser-public.json、navigation-approved-staging-update/final-preservation.json、navigation-independent-review-20261031.json。构建依赖比较另见navigation-image-verification.json，994786→603770字节仅为未压缩静态导入图，不能解释成下载流量或速度改善39.3%。本次后继文档checkpoint未另行推送、构建或部署，不替换上述源码身份。

以下为交付前工程事实，保留原日期/失败记录；其中29d6和“待交付”描述只对应当时状态。

2026-10-31；分支fix/brand-shell-navigation；干净输入29d6ca76885bac41dc674dc97122a5c19798d416；本轮API核实main e37a131a7182a5488f440dcc8fde3ea66de1c6e4、PR138草稿。沿用[用户已批准导航改进范围](brand-shell-navigation-2026-10-30.md)，再次反馈慢后继续完整Gate0–8/R，不改变业务规则。

## 实际输入
体验站29d6图标修复已完成：outputs/favicon-completion.json记录182项发布回归、三项CI、同源图标200及旧账号业务/附件/资产保留。旧文档“尚待部署”不是当前事实。

实际浏览器从首个页面请求到数据响应：报价→订单4298ms、订单→进度设置5184ms、订单→报价12739ms。三次均27ms内发出相同RSC两遍；订单API914ms、设置API741ms；订单切换浏览器任务增量171ms。不是精确的可交互绘制时点或全球网络基准。宁波容器内订单RSC39.12ms、设置RSC2.45ms、设置JS1.19ms；公网交付等待与顺序加载主导，未区分用户到边缘、边缘到源站、代理各自贡献。脱敏证据在ignored outputs/navigation-performance-20261031.json和navigation-origin-timing-20261031.json。

vinext0.0.50只消费已完成的预取快照；pending返回null，快速点击再请求。原列表与编辑器共用客户端模块，实际加载附件、工艺、议价和日志后才读列表。

## 实现与边界
- 菜单改为精确白名单客户端代码预载，hover/focus/click共用promise；失败不阻止导航，后续意图可重试。实际RSC仍由原路由器读取，保留no-store和框架时效；不改依赖或全局fetch。
- 登录后稳定1500ms且有对应权限、未启用节省流量时，仅预热另一个主要工作区代码。离开/身份失效取消未执行计时器。模块不挂载、不调用业务API，不持久化业务数据。
- 独立报价列表；Browser列表仅在原Browser分支加载，新建/详情保留原实现。议价/加工窗口按打开动作加载，可取消，失败明确提示；成功后沿用原命令、幂等、金额权限、未知回执保护。
- 不新增价格/身份缓存，不改变报价、订单、来源、关账、金额规则，不安装依赖，不新增真实来源读取或调度，不修改体验站或旧数据。

## 本地验证
Server构建、类型、定向lint、5项加载/authority检查、25项真实浏览器导航检查通过；新增慢网pointer/focus/click只发一次RSC、不重做auth/me；列表不提前加载编辑器、附件和可选命令窗口。脏草稿、未知回执、Back/Forward、跨身份和手机/收起侧栏仍通过。加工窗口8项通过，包括纯工价、重复批次、跨页选择。

订单议价7项浏览器检查通过；新增可选模块加载失败/取消验证不发业务命令。993项项目总回归全部通过（0失败/跳过，694443ms），覆盖发布守卫与响应式回归文件；加载器移入正式tests目录后另3项通过。最终定向lint通过，源码checkpoint f034bb955a258e7bafc71797dd5ec32821ff3eb6精确门禁PASS（12页面/68能力/20累计UI路径）。旧29d6结果不冒充本片。当前站保持29d6，本片未上传/部署，不宣称公网提速。UI记录docs/release/ui-changes/navigation-performance-20261031.json。历史冻结文档/截图原字节保留；前一入口逐字归档../completed/2026-10-31-navigation-input-state/。

首轮精确门禁仅因UI记录使用未登记的system-settings页面标识失败，已改为现有具体页面ID；保留失败日志。不改守卫或放宽规则。全项目回归已包含发布守卫/响应式测试，误启动的重复发布测试已停止；复用完整项目结果，不将停止的重复运行记PASS。主控差异复审核对代码预热无业务读取、旧列表命令/权限保留、异步失败可取消、身份/离开保护与历史证据边界；未发现未解决P1/P2，不冒称独立复审。文档收口提交仍须精确门禁，远端必要CI和新镜像体验验收另记。
