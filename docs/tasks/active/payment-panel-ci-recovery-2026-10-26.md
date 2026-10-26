# PR130货款侧栏调用者兼容修复

2026-10-26；branch codex/persistent-cumulative-43-main-869e，本阶段baseline f8ed7f33c911cc1ec52cf3b3d9432912ac5aa80f / tree d93752452c4d4ec504f09192c1b16beb5f31f51f，原clean。完整SHA已一次送达，唯一草稿[PR130](https://github.com/clearisok/zhixu-erp/pull/130)；当前main仍以原869ee84dd0b31de6161011e4aa560678b244a64d为基准，下一次交付前再次核实。原f8由codex/persistent-cumulative-43-first-delivered保护，原提交/QA/失败均保留。

## 已观察与最小修复

首次Hosted baseline、team-access通过；source中SQL/API、数量/隔离边界和构建通过，但浏览器末项payment-read-panel-ui连续超时，最终20分钟取消，Python未运行。不能把source记为通过，也不能只延长限时或直接重跑。

一次本机诊断使用f8 Git archive（初次Windows换行转换未逐blob核验，不作为正式QA输入）、已验6d镜像原dist及全新合成PG/私有浏览器目录，32483ms失败：首项existing drawer timed out。诊断仅有失败输出/fail-fast测试overlay，不是QA PASS。旧选择器点击动作区第一个button；累计UI先渲染到货维护action，再渲染具名“查看…事件”，因此未打开事件抽屉。

只改测试：按具名aria-label选择事件按钮，仍只点击一次/原20秒等待；前置失败立即停止依赖阶段，原8个子用例和业务断言保留。CI增加expected compiled source断言。无产品UI、SQL、API、权限、DTO、来源或业务规则变化，不延长workflow20分钟上限。

## 计划与边界

修后以新source checkpoint的canonical runner验证；复用已验6d镜像dist（产品源码相同，显式记录test/render不同SHA），不重build、不改既有dist/体验入口。执行9项实际浏览器及定向Node/lint/YAML/原断言保留检查；新source通过后冻结新证明、最终exact-main守卫与独立复审，再一次交付更新唯一PR，必要CI保留。尚未运行的检查不能记通过。原f8 Hosted baseline通过按原head复用，不称新head重跑。

保留3001/50426等原环境、账号/库/卷/备份、Browser与原43迁移8项证据；无真实Source请求，不合并、正式部署、切换或退役。完整G1–G8/R继续，关账三项等待决边界不变。原状态逐字归档见[输入](../completed/2026-10-26-payment-panel-ci-input-state/receipt.json)。

正式QA准备首次在逐blob校验.dockerignore时发现Windows换行转换，尚未启动测试/数据库；目录保留，改用已有进程级core.autocrlf=false归档方式，不修改共享配置。后续正式runner必须逐blob一致，诊断旧结果仍只用于定位、不计QA PASS。

实际修后终态：test source 01d112b98e02d8aaacb4af14b4fa4522d6d3c207 / actualParent 49ff169b09e22f3891beab17ed2b6b605d168e31 / phaseBase f8ed7f33c911cc1ec52cf3b3d9432912ac5aa80f，renderSource 6d27d1e7fa1079f1830511068ff070791df310ab；canonical 2983 tracked files/0 overlay，复用dist 1211字节匹配文件。实际9/9、23202ms、0 fail/cancel/skip/timeout/overflow；语法/lint/YAML/8原phase体校验通过，旧50/179/27元数据changes=[]。完整原件hash见[证明](../completed/2026-10-26-payment-panel-ci-validation.md)。下一步最终守卫/复审后仅更新原PR130，未交付新修，不称新CI通过。

实际Q 45a4c2324f5e8a792fe69fd157b7d09b230842aa冻结证明；R只追加独立根至504证据/66能力，旧503与其他manifest/UI字段不变。最终同HEAD门禁与复审待实际结果。

首次最终候选2c055e3f2c5b4f434a619601f4af2f3ee9714543的exact-main守卫131615ms FAIL，仅AI_HANDOFF/PROJECT_INDEX漏写完整main基线SHA。补齐两份状态文档的同一已核实869ee84dd0b31de6161011e4aa560678b244a64d，不改证据/业务/测试；原guard.json/log保留，新文档提交另做精确守卫，不重跑9项或构建。
