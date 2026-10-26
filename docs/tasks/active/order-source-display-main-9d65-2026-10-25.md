# Gate4B 保存来源展示：当前main依赖上的本地合流

2026-10-25，root唯一writer、既有独立reviewer只读。branch codex/order-source-display-main-9d65从实际API核实main 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf干净建立，显式FF到已验收读取链74c94a5138457f645a3667949901320fae450456，普通merge原4B终态19c3faf2d7ab37a8ef1b332d5156b14e45382a56，保留原历史，不rebase/squash。只有三共享摘要和baseline冲突，无业务或UI代码冲突。

## 已批准范围

D147/G4窄V1：原订单详情中默认折叠的已保存颜色尺码，以及原来源/技术披露内按需GET的织序DeliveryPlan。保留P6颜色/数量/价格、slot/null/明确0、matrix异常、decimal、计划归属/作废历史。当前session/layout/order/展开尝试拥有回复，旧200/401不污染新身份；无Browser fallback、来源采集、商业写入或计划编辑，不把4B当4C。两个原组件和原V1语义不改，只校准到当前main；[原V1归档](../completed/2026-10-25-order-source-display-input-state/README.md)保留。

## 精确复用，而非重复执行

合流预览及实际树全部非docs文件与冻结6ef9e37493127661a9d805979660378f6340ad5f逐Git blob相同，包含UI、Server、SQL、package/lock、编译输入、脚本及测试。原canonical archive SHA256 0954801c7b833e74028cd4028dccf650b947a4e488492b8e6cb68a48fd7a5bf9已核对，旧日志计数与回执一致。复用原6ef的typecheck24618ms、lint37547ms、Node编译11839ms/import1899ms、API9、根811、before2/after9/P6与来源20、双模式构建和产物检查；当前不重跑、不重建、不索取新截图。

[原冻结工程证明](../completed/2026-10-24-order-saved-sources-engineering.md)的before是ca53客户端/6ef后台，after为6ef；不是本候选新构建或新浏览器。七张PNG和两个几何JSON保留其原source，工程检查不等于用户接受。原4B短路径构建exit0但产物失败、规范长路径对照及Browser唯一modulepreload提示均保留在原证明，不把失败批次或旧source改成当前全绿。原134属于fdad，原97文件811属于6ef，不合写成新候选945项重跑。

manifest用共同8da做三方校准，完整保留当前241和原4B247每个证据对象，并集251/47；已有页面/CSS/响应/路由/运行对象仅接受原一侧变化，共同对象冲突即停。原46能力保留，新增第47项沿原implemented/isolated历史证据，不把merged/deployed/userAccepted提高。新UI实际范围仍原两个组件，不能用继承导航的旧浏览器结果冒充4B结果。

最终实际双父、冲突清零、非docs等价、证据并集、独立复审和精确main守卫按outputs/order-source-display-staging-20261025的同HEAD终态回执核对，缺失不视为PASS。未来真实PR交付仍需当前base的134及三必要CI，不因原134已过跳过新交付门槛；本轮Hosted0。

## 保护与完整Goal

PR129仍唯一草稿且三项原CI通过，具体merge待用户答复；本候选明确依赖未合并导航和本地4A。Git exit1原因UNRESOLVED，STOP不解除，不push/ref/PR/HostedCI/merge main或更改认证/共享配置。真实Source额度、target启用、关账三问、coverage V2、入口切换/用户接受和旧资产退役仍独立待决。

没有应用新的SQL、运行环境、真实账号或业务库操作，没有读取凭据/旧私密Source报告、绑定/激活/调度。62426旧8175及50426/3001/59069等保持；fbfecb保留main镜像8/8与50容器/179卷保全，db683保留CI成本控制，b611保留完整审查，7da保留后续全部工程。该candidate不包含fbfecb的独立harness修复，不因此擅自跑旧harness。

完整G1–G8/R继续：4B不是G5创建报价、4C维护、生产/出货/Server关账或真实来源闭环，Goal不完成。父级原摘要和frozen证明继续保留原日期/hash/结果/限制。
