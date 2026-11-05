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
第一片4项缓存测试、类型检查通过；后续结果待补。无新CI、无上线速度声明。
