# PR130货款侧栏测试兼容：实际9项与边界证据

2026-10-26；test source 01d112b98e02d8aaacb4af14b4fa4522d6d3c207，actualParent 49ff169b09e22f3891beab17ed2b6b605d168e31；phaseBase f8ed7f33c911cc1ec52cf3b3d9432912ac5aa80f，初始修复49ff为中间原提交，未改写。原source-checkpoint.parent字段沿用phaseBase，不是01d直接父；source-lineage.json明确区分。

## 原失败与修复

PR130首次baseline/team-access成功，source先完成SQL/API/数量隔离/构建，再因货款侧栏浏览器旧位置选择器连续超时而达20分钟取消，Python未运行；该source结论不是PASS。一次本机诊断32483ms明确首个existing drawer超时，尚未进入付款读取；不能把CI全部摘要误称金额或请求故障。旧驱动取动作区第一个button，新增到料action置于事件按钮之前，禁用按钮click仍返回true，导致错误等待。

仅改具名事件按钮选择及disabled检查、依赖失败即停、CI compiled SHA断言；8个原phase函数体/断言逐字保留，原20秒等待/240秒用例/20分钟workflow均不变。无产品UI、API/SQL、支付DTO、角色、币种或业务规则改动。没有为通过延长时限、删测试或重算金额。

## 新实际验证

- canonical test source 01d112b98e02d8aaacb4af14b4fa4522d6d3c207，2983个Git blobs逐一匹配，0 tracked overlay；复用6d镜像原dist的1211文件逐一相等，制品摘要00bb0e6aed617c7091c44c7ce7a4a062373d6c36ccb978bb8ba19c1ae5ad5074。编译渲染source 6d27d1e7fa1079f1830511068ff070791df310ab、image sha256:6a30bf2e192a27b090a9444244d4c918e09afc07f5f65df1d5ae672c4c1677be。两者产品/API/SQL完全相同；不能称6d镜像为01d构建，也没再build或重跑43迁移8项。
- 首次修后实际Chromium 9/9，23202ms，0失败/取消/跳过/超时/溢出。8子项涵盖首次按需读取、六宽度、127行分页/精确十进制、过期、目标变更、延迟取消/焦点、七角色/无Browser回退、真实合成DB撤权。截图为本轮私有新证据，不覆盖旧截图或冒称人工像素认可。
- Node语法/精确ESLint通过；YAML实际解析仅增加expected-source env，旧步骤/required测试/20分钟保持；8原phase体AST逐字核对。
- 初次正式runner准备在.dockerignore逐blob校验拦住Windows换行转换，尚未启动QA/DB。目录保留，按已有进程级core.autocrlf=false方式修复，不改共享配置；早期诊断archive不计canonical QA PASS。
- 旧50容器/179卷/27网络所选身份/状态/health元数据仍changes=[]；新合成fixture由其自身finally回收。此项不是旧业务内容审计。

原f8 Hosted baseline、类型/全仓lint/项目回归与其余SQL/API/UI成功结果只按原head使用；本阶段无这些代码变更，不重复跑完整144、TS全仓、产品构建、Python或8项持久化，也不冒称它们在新source重跑。最终R仍必须exact-main守卫和独立复审；下一次必要PR CI待实际终态，不直接重跑旧run。

当前main经本次API仍为869ee84dd0b31de6161011e4aa560678b244a64d。唯一草稿PR130保持，尚未交付本新修复；完整G1–G8/R继续。无真实Source请求、既有账号/业务数据/环境变更，不merge、部署、切换或退役；稳定成衣事件/更正、关账三项及人工接受等后续边界仍在。

## 本机原件SHA256

diagnostic.json：2792a7f2514f258061af326db612de0481df6668f23315d984e8b6c227f12dca

qa-preparation-interruption.json：9b9889ea3c6f6ea2236266410aed03526192b615fbb2362611823618de640618

qa-prepared.json：4904347c5afb92beafefa9338e3ba71327c2ee056161baddb5ee276a14443316

checks.json：ab44fe1039e27d5404b2810ff98165659bf74636842d7af7cde8fd7fd58a4abd

yaml-check.json：ff7a8d3b27faa48274a03aed15377750352353eb4bccaa3ada16684a3fcd580e

qa-result.json：e4c877f30ac49012ff3dc62f4d4cb8b7158c5dceb11574c4bf98b09ab39590e8

qa.log：87bc59b040c5630d5ea2986e441a8265cba10e143035375ac4c87a7cdd7c5373

preservation.json：1d246bdcb2193be52cfc0cf42ec8b7a6b1f422dbadccd0193e89f891ef0b6d6c

source-lineage.json：0aa0e2ab4839429f28991db84dfac08b76fbea6b3b48f547e2fc7e98ba63397c

原件在outputs/payment-panel-ci-recovery-20261026；原Hosted失败原件在outputs/persistent-cumulative-43-20261026/ci-first-terminal.json、ci-source-output.json及ci-source-log-tail.json。原raw/private诊断与截图不上Git。[当前阶段](../active/payment-panel-ci-recovery-2026-10-26.md)。
