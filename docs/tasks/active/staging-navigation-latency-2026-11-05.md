# Staging 页面切换调查与实施

输入 main cb5cc29baa49ed7115fdb6c9506b6a80356936ea；实际 staging f21c96c1899126028ba9a272727ad8d564ccf185。独立分支 fix/staging-navigation-latency。用户已要求分项实施并提交；禁止部署/服务器/隧道/Cloudflare配置变更，禁止业务数据修改。旧艾诺科进度保留在独立工作树。

## 只读证据
- Vinext 0.0.50 App Router兼容层，React19，无React Query；页面文件只返回客户端组件。
- 实际订单 RSC1324ms，API1051ms，首个请求至数据响应2392ms；辅料 RSC1262ms→页面JS410ms→三个并行API（最慢1199ms），总2878ms；报价 RSC383ms→列表463ms→可见缩略图约1154ms，总2020ms，列表854ms。均单样本网络响应计时，不是绘制耗时。
- `server-basic-settings-adapter.ts` 已使用Promise.all；`quote-master-dependencies.ts`多个适配器重复调用同一基础资料。`quote-master-server-client.ts`无缓存，全部no-store。
- `server-navigation-modules.ts`只预载代码，未覆盖基础设置路由；不能重新引入Vinext快速点击重复RSC的旧缺陷。
- `list-image-loader.ts`已有3并发和可见消费限制；失败不重试。`quote-attachment-client.ts`完成读取后cancel流；卸载/离屏也主动取消，canceled不等于显示失败。
- 浏览器复现旧合成报价缩略图503 `attachment_thumbnail_unavailable`；两张正常图片200。服务端统一编码生成失败，具体原始对象/解码原因尚未验证。未修改原附件。当前标签页console error/warn=[]，不证明用户旧5–8条错误已全部解决。
- layout metadataBase硬编码localhost，无staging noindex。

## 决定与风险
复用现有客户端/鉴权；基础资料按会话与权限隔离内存缓存120秒，不落盘。订单/报价仅允许导航已确认后的单次短暂交接，不做跨导航TTL缓存。与RSC并行读取避免另建SSR Cookie代理（当前web/API为独立进程）；直接深链仍沿既有客户端恢复会话。
缩略图保留预算、仅临时GET失败有限退避；浏览器缓存必须每次服务端重新鉴权，不能公有缓存或长期免校验。页面已存在加载状态，优先保持布局和权限保护。
用户要求骨架或旧数据加载状态，保持原外观时为V0；不借本任务重设计页面。

## 验证
第一片检查结果见下方汇总。无新CI、无上线速度声明。

## 本机同条件浏览器对照
主分支cb5构建与8abca4db候选构建，各用同一GET-only合成fixture，每个API/RSC固定延迟300ms，无PG、无真实账号、无外部访问。CDP请求时间戳与实际DOM可见数据交叉核对；下表终点是响应头到达，不冒充精确绘制时间。测试单样本，不作公网SLA。

|路线|基线|候选|RSC/API串行层|
|---|---:|---:|---|
|报价→订单|654.400ms|323.791ms|2→1|
|订单→辅料|655.791ms|315.435ms|2→1（基线还需页面代码）|
|辅料→报价列表|642.858ms|315.052ms|2→1|
|辅料→报价缩略图|1050.878ms|768.082ms|3→2|
|两分钟内再次进入辅料|RSC+3API|仅1RSC，313.748ms|2→1|

候选订单API与RSC相差1.223ms发起；辅料3API与RSC在0.545ms内发起；报价列表与RSC相差0.554ms。报价缩略图实际显示正常，表格先出现。未预热RSC，无重复身份请求。现有LoadingState本身已有骨架，无需另换布局。
实际客户端/适配器回归：基础资料17→7请求，同会话TTL内再读0请求，保存后重读7。身份切换/失败/过期/单次交接已测。新标签页console error/warn均空；不声称用户旧日志全部定位。

## 部署时由用户配置（本轮未执行）
`NEXT_PUBLIC_SITE_URL=https://staging.weaveops.top`，`NEXT_PUBLIC_SITE_ENV=staging`，按现有构建流程提供。缺少URL时不生成虚假的分享图片；staging主机或非明确production环境均noindex。未改Docker、Cloudflare、隧道、服务器配置。

## 验证状态
lint/typecheck及Server生产构建通过；初次构建误填writer=server失败，改为既有合法writable、orderRead=snapshot后通过，未修改解析规则。11项新纯逻辑测试、21项定向客户端/图片测试通过。全项目首次977项中957通过、20项发布守卫失败，均指向新接力与旧清单基线不一致；前向对齐后仅重跑受影响发布回归，不重复已通过业务测试。
本机Docker引擎管道不存在，未重试/启动/更改配置；新增304/权限数据库集成测试尚未执行。源码逻辑仍先读会话与关联，再生成校验缩略图，最后处理ETag；不能用单元测试冒充数据库验收。

## 请求依赖与范围

`→` 为依赖，`∥` 为并行；均已登录站内导航，首次直接打开仍需会话恢复。

|页面|原链路|候选链路|主要发起位置|
|---|---|---|---|
|报价中心|RSC → list → 可见thumbnail|RSC ∥ list → 可见thumbnail|production-quote-list-page.tsx → quote-server-client.ts；list-image-loader.ts → quote-attachment-client.ts|
|订单中心|RSC → sales-orders|RSC ∥ sales-orders|server-order-center-page.tsx（页面）→ sales-order-server-client.ts；导航交接由server-navigation-data.ts启动|
|辅料库|RSC → 页面代码 → (supplier ∥ settings ∥ trims)|RSC ∥ (supplier ∥ settings ∥ trims)，TTL内只需RSC|server-basic-settings-adapter.ts → quote-master-server-client.ts|
|面料库|RSC → 页面代码 → (supplier ∥ settings ∥ fabrics)|RSC ∥ (supplier ∥ settings ∥ fabrics)|同上；按scope加载|
|报价设置|RSC → (settings ∥ presets)|RSC ∥ (settings ∥ presets)|quote-master-server-client.ts；server-navigation-data.ts|

基础资料7类：品牌、业务员、面料、辅料、供应商建议、报价设置、制作预设。现有React Query staleTime不存在；原客户端fetch全部no-store；本次仍保留传输no-store，仅加会话内120秒缓存。没有改变Next/Vinext共享fetch缓存或revalidate。当前main未找到名为production-master-settings的端点，不能声称对它做了同样优化。

|变动|预期收益|风险/限制|
|---|---|---|
|保护通过后并发读取|列表减少一个网络往返；不等RSC挂载|取消/快速切换可能浪费一次只读请求；范围仅白名单，未授权或被保护阻止时不发起|
|基础资料内存去重|跨适配器17次降7次，TTL内重复0次|其他用户修改最多120秒可见；原并发版本保护仍有效|
|缩略图有限退避、ETag|临时503不再一次即失败；可减少响应体重复传输|仍需网络往返和服务端原图校验/解码，永久坏图无法靠重试修好|
|已有骨架与可见图加载|列表不等待图片|不承诺消除跨洋延迟；未改现有布局|
|HTTPS分享元数据|不再指向用户的localhost，staging不索引|构建变量需在用户后续发布时提供；本次不改部署配置|

最终增量类型检查及相关lint通过；第二次Server生产构建完成。发布文档前向记录需先提交checkpoint，再绑定冻结决定；首次对齐检查仅剩该文档漂移，未降低门禁。
