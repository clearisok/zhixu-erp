# 订单读取链：基于已交付导航的本地合流

2026-10-25；root唯一writer，既有独立reviewer只读。branch codex/order-readchain-main-9d65从本轮API核实main 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf干净建立，再明确FF到PR129已交付head d1917aaf91f6bfde5904e4f49dc1b6fd82599680，普通merge原读取链8da0fafb5ebe1f15bb747f44e69ef4ef779d93c5。保留原提交，不自动rebase/squash/force。PR129仍未合并；这只是依赖它的本地候选，不是main发布或合并建议。

## 产品范围与实际合流

相对导航依赖只有15个非文档路径：保存的6087105颜色/尺码白名单DTO、精确mirror/link选择、独立DeliveryPlan GET客户端，以及已有加工Estimate专用命令拒绝和对应回归/命令入口。无schema、权限目录、来源采集、商业价格、4B展示或4C计划编辑变化，不混入后续生产、出货或关账。合同身份、颜色数量null/0、matrix状态、原计划/价格与创建历史保持。原实现与测试说明见[读取链](order-source-readchain-current-2026-10-24.md)、[加工保护](processing-estimate-current-2026-10-24.md)。

实际Git合流仅冲突AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX三份共享状态；无应用、SQL或业务代码冲突。按新入口写当前事实，父版本全部在保留历史中；[原V0归档](../completed/2026-10-25-order-readchain-input-state/README.md)保留旧baseline、日期和读取方法。V0仍只覆盖两个前端只读类型/helper路径，基线从e01a校准到9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf；不增改视觉设计。

## 复用依据，而不是重跑声明

预览及实际候选的**全部非docs文件**与冻结c77ddc9f0746b5e2e4ebd271bca8b9d57b5c1d7f逐Git blob相同，包含应用、Server、客户端、SQL、package/lock、编译配置、脚本与测试。原tracked archive SHA256 e1de07097f005d3b0b882761ccaa7f810566c3667e91cdf3aae81b9fe2b90beb已重新核对；原日志确为103/103，0fail/cancel/skip，九个caseFiles及全部原结果保存在ignored reuse-evidence.json。

按这个严格范围复用原c77的103项（76835ms进程）、typecheck22691ms、Node编译/import11709ms、lint37770ms，不写成新候选再次运行。原edf6a7639e94690c30ac62030ab1ec7b1e3757f2的Estimate实现与两个回归文件blob也相同，原28/28及其时间/限制继续归原SHA；不扩称新的28项合流运行。无组件变化，不重建/重复已通过的87/66浏览器；导航原90/44/2失败批次及后续精确范围也不改为全绿。

复用检查首轮误按TAP格式读取原spec日志，验证helper失败；没有执行测试、访问DB或改变产品。按实际spec计数修复后重新检查旧归档与日志通过，原失败保留于helper-failures.json，不冒称测试失败后重跑成功。

清单完整保留导航241与原读取链237的每个证据对象、46能力及其他页面/CSS/响应式/运行/权限事实；只校准当前baseline/时点，能力状态不虚增。最终合流双父、冲突清零、非docs等价、独立复审与当前base守卫必须另有同HEAD回执。缺少回执不视为通过；本地最终记录在outputs/order-readchain-staging-20261025。未来真实PR交付仍保留134发布回归和必要三项CI，本轮不为本地合流触发HostedCI。

## 运行与授权边界

PR129 d191原三CI首次通过，仍唯一草稿；merge问题已发出、未答复，不擅自ready/merge。Git exit1原原因UNRESOLVED，STOP继续；本轮无push/ref/PR/认证或共享配置变动。新分支将来交付前须按当时main前向核对，不能因本候选基于d191就跳过其依赖。

无真实Source读取、旧私密报告/凭据读取、绑定/激活/调度、现有账号或业务DB/卷修改；不新建运行环境。原62426保持8175，50426无监听原因未知。fbfecb5753138406404df0307e7c15318cebd73e保留上一轮精确main镜像8/8隔离恢复及旧50容器/179卷保全；该harness修复是另一本地分支，本切片不声称已包含或部署它。db683保留独立CI成本控制，b611保留完整就绪审查，7da保留累计成衣工程；均未丢弃。

完整G1–G8/R继续。4A读取不代替4B展示/4C维护、真实来源验证、生产闭环或Server关账。原三项关账业务选择、真实Source额度/target启用、coverage V2、体验切换/人工接受及旧环境退役仍分别待决，不重复索取已有待答复。
