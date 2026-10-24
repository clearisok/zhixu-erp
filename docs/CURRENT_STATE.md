# 当前状态：精确main持久化演练通过

2026-10-25；实际main 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf，branch codex/main-persistent-rehearsal-9d65。单次实际镜像演练8/8通过、零失败/跳过/取消（325770ms）；31份迁移、合成报价/附件在重启、冷重建及独立DB+对象恢复后保持。原50个容器身份/状态与179个旧卷保全核对通过。

镜像zhixu-persistent-main:9d65c868-20261025-09831663ee完全来自main canonical archive，2346个blob核对，单次构建82674ms。仅测试runner覆盖新harness：prepared归属、旧网络/保护端口拒绝和假compose回归；原应用、ops运行脚本、SQL与UI不改。镜像source与测试blob分别记录，不能称原main7项原样重跑。目标ESLint、链接/白名单/清单等价已通过。

所有旧体验环境、账号/业务库/卷/备份保持；只操作本轮两个新合成项目，成功后按原harness清理其测试资源。没有新常驻目标、Source请求或HostedCI，不把候选验证当入口升级、真实部署或用户接受。当前62426仍旧8175构建，50426此前无监听且原因未知。

保护分支：b611c61f65227113b6203d23a1a0fe46cce4537b保存完整G1–G8/R就绪审查，7da954545bd9b720bfc28edbd313bc387dd5c195保存累计成衣工程，db683892e7c90df3ea81c4b8162dd2aa36a3d03a保存独立CI成本控制。均未被本main基线分支删除、合并或部署。

PR129仍唯一草稿，精确d1917aaf91f6bfde5904e4f49dc1b6fd82599680的原三CI通过，具体merge待用户答复。Git STOP原原因UNRESOLVED；不上传其他分支、更换认证或自动合并。真实Source额度/target启用、关账三问、可见coverage V2、62426/50426切换、用户接受和旧资产退役继续独立待决。

[本阶段记录](tasks/active/main-persistent-rehearsal-2026-10-25.md)与ignored outputs/main-persistent-rehearsal-20261025保留镜像/TAP/保全证据。最终commit、复审与base源码守卫核对final-checkpoint.json；缺回执不得视为通过，已通过同HEAD不重跑。134及三必要CI仍是未来真实PR交付门槛，本阶段未新运行或冒称通过。完整Goal仍active。
