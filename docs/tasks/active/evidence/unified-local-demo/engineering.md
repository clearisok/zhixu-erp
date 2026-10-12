# 统一本机演示：冻结工程证据

核实日期2026-10-12。main 3456fe5fc6e213c2e896e4e6a509e28751f1798c；候选生产代码 f430123cb0dc201350b9558de41edd85afe3f9b4（main/PR101 合入 PR100）。本文与相邻截图冻结，后续结果另建证据，不覆盖。

## 事实与用户决定
用户确认“登录页可以”，授权合并PR101，并将PR100整合到同一本机演示；禁止真实账号、数据库或部署。PR101在caf99c35b82d6c2f633209dd2385869ffeb8ea54三项CI成功后，于2026-10-12T11:56:09Z合并为上述main。来源：GitHub PR101 API与用户当轮原话（见上层任务）。PR100仍OPEN，不获得自动合并授权。

## 本轮实际验证
- typecheck、lint、server:build、显式Server/session/snapshot真实构建通过。登录CSS与P6业务布局未重新设计。
- npm test：810/810；test:release-baseline：71/71；实际main参数的check:release-baseline PASS（10pages/12capabilities/9changedUiFiles）。
- test:server-auth-frontend：112/112；test:animated-login-ui：10/10；test:team-access-ui：5/5。
- test:ainuoke-continuous-ui：9/9（父测试+8子项）：真实动画表单登录与深链回跳、报价/订单导航、物料退出与物控角色重登、1440/1280/390布局、六角色来源采购价、30秒下一代自动读取、失败/陈旧清空与恢复、UUID及未开放路由保护。没有Browser业务storage或非Auth业务写入。
- test:ainuoke-continuous：Windows29通过/1Linux私密文件测试跳过；该跳过只能由Linux CI覆盖，不算本机PASS。原PR100 Linux历史30/30不冒充当前CI。
- 初次组合UI断言找不可见报价编号失败；实际列表已正常显示合成款号。改为断言既有可见款号与款名后完整重跑9/9通过，未改产品布局。
- 初次root/guard因新增决策尚未建立前向冻结证据而失败；新增decisions-combined-local-demo、保留main所有冻结项后，重新完整执行810/810与71/71通过。未删除/跳过失败用例。
- 相邻order-1440.png、material-1440.png与computed-styles.json来自上述候选生产构建、独立随机本机Origin、合成PostgreSQL和私有Chromium。人工查看截图无新增布局问题；这不是用户订单/物料人工验收。

## 演示与隔离
demo:ainuoke-continuous已实际启动：一套loopback API、一个随机临时PostgreSQL、六角色、合成报价/绑定订单/四流；60秒生成来源，30秒页面读取，自动2小时结束。附件只在MemoryAttachmentStorage。本机临时地址不作为部署证据，实时地址以当轮交付为准。
没有调用真实来源、真实DATABASE_URL或真实账号；没有数据库schema变更、宁波/18443/18444操作。默认orderRead仍disabled，只有显式候选启用原三页；生产排单/关账等仍blocked。

## 复审与限制
已检查合并的会话边界同时保留公共/login、isEnabledServerRoute、LoginRedirect和失败可重试的SessionLogout；原源码/截图历史保持。组合范围未发现新增P0/P1。PR100是否合并仍需用户授权。
PR101登录视觉为已获人工接受；订单/物料合成体验尚待用户反馈，真实业务/真实连续采集/上线均未验收。新合同与主镜像/颜色增量、完整候选镜像、真实安全通道/绑定/连续运行/恢复演练仍待后续Gate。
Quote扩展回归历史main与PR101同为69/78、8项相同失败+父测试；本轮未修复或重跑该整套，保留其冻结对照，不声称全系统全部测试通过。当前准确CI以PR100精确head为准。

更新时机：本文件不改写；后续代码/CI/人工验收/环境结果建立新证据，并更新CURRENT_STATE、feature与manifest引用。
