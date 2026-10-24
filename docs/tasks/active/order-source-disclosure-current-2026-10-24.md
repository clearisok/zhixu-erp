# Gate4B：订单保存来源只读展示向当前 main 前移

2026-10-24；root唯一writer，沿用一个独立只读reviewer。先读取规则、当前状态、实际diff与原批准G4。
本轮只读GitHub API再核main `e01a11952b648024c0bd6bf4259de429374981e2`，从该main新建
`codex/order-source-disclosure-current`，显式快进到已验收4A
`8da0fafb5ebe1f15bb747f44e69ef4ef779d93c5`，开始clean。起点与前移核对存于ignored
`outputs/order-source-disclosure-current-20261024/{start,forward-scope}.json`。

## 最小复用与兼容核实

复用a187→`96e9d320ff6d0ad51254291cd3c35c2d32d6070f`原4B的两组件、新真实浏览器驱动及金额负控。
不带无关animated-login测试、旧workflow、manifest、共享摘要或原日期的通过标签。
首次核对在金额测试发现main已有更强字段断言而停止，未复制任何文件；进一步核实当前
`38ad45e03e1e9988090e1e00d36340cc2ed1f56a`→候选`b06975c34e89876b077cb08fb0f6dfea823b69cb`
仅追加5行递归金额/无害ID负控，0行删除，故保留两套检查。其他组件/新路径与原基点一致后才前移。

## 已批准V1与行为

用户G4要求可信颜色/分码→物料/计划只读闭环。恢复在原“分码尚未接线”位置，使用既有样式的
默认折叠原生details；原颜色/数量/价格表保持。既有“来源与技术详情”内按展开动作懒读织序计划，
展示独立所有权、decimal原文、空日期、0、作废历史和来源对照。不自动合计/补算/分配或刷新艾诺科。
unknown、待确认0、明确0、记录时matrix异常分别展示；加工不虚构艾诺科颜色/合同对照。

新GET回复由订单/当前session对象/展开状态/尝试次数的layout owner与lease共同绑定。
旧成功或401先判归属再更新/失效；错误不保留旧计划，手动重试只GET。
这是原目标内的窄V1恢复，不是新导航、密度或交互模型；不能据此声称人已接受当前像素。
原test实际覆盖200跨A→B→A，以及旧401跨同账号重新登录；不扩大为整个页面所有请求的身份证明。

原驱动关闭未确认即清profile的P2已按当前stopOwnedChromium修正：Browser.close明确省略sessionId，
证据写入失败仍清理HTTP/PG，Chromium退出未确认则保留私有profile，不报告cleanup PASS。
不增加父级240s、CDP15s或轮询20s预算，不靠重试点击/放宽断言通过。

## 验证计划、证据与成本

先冻结源码。before观察复用已验收ca53的真实Server客户端构建，明确完整rendered SHA与新后台/测试SHA，
只允许显式before模式使用该静态目录并逐字核build-info，不将它称为新的4A前端构建。
after从新的canonical archive构建Browser兼容与Server/session/snapshot两种产物，外部已审产物检查器核验。
实际私有Chromium验证六尺寸、默认折叠、未知/零/重复槽位、计划精度/历史、加工、七角色、错误/只读重试、
真实登录切换与迟到401；主控查看截图。再跑受影响P6/来源/商业/导航检查，不重跑无关已通过报价87。
类型/Node编译/lint、实际相关API、发布守卫及必要根测试按冻结源码记录，不冒称脚本存在就是PASS。
旧9/9、c77的103/103前驱及134结果保留原SHA；新能力须在实际验收后另冻证明，再前向绑定新分维度证据，
保持全部237旧证据/46能力、PNG、运行快照与main守卫不变。

#125仍CA草稿、4f精确API例外待答复，不借旧对象exact声明已永久恢复Git；本阶段尚无push/PR/CI。
无merge/close/deploy/真实账号业务库/凭据Source/调度/入口退役或共享Git配置变化；所有旧环境/卷/备份保留。
4C计划编辑、G5创建报价及生产/出货/关账仍按依赖继续，不缩小原Goal或将4B代替全项目完成。

## 2026-10-24 当前源码实际验收

冻结6ef9e374的新owned环境：类型、Node编译及实际import、full lint、9商业来源API、811根非发布、
before2、after9、原P6/来源向导20均PASS，0失败/取消/跳过；双模式构建/产物各45页+fallback/109assets。
独立源码与日志复审无新增P1/P2；主控查看7张before/after/展开图。首次短路径构建exit0但产物失败，
完整保留；只做一次规范长路径有界对照，不改业务代码或检查。详见新的
[冻结工程证据](../completed/2026-10-24-order-saved-sources-engineering.md)。
最终发布134、manifest新能力及精确main守卫将在此证据冻结后单独收口；未提前标PASS。

## 发布与最终本地收口

新证明6d53、产品6ef及7PNG/2geometry均按真实Git blob绑定；manifest247/47，原237/46与runtime逐项不变。
fdadce3b357833439e224bfb950c8f67da57d2f8上的显式npm run test:release-baseline一次134/134通过，
进程280026ms，0失败/取消/跳过。与此前97个非发布根文件811联合恰覆盖标准npm test的99文件/945项；
未重复成功811，只有发布测试读取本轮变化的metadata。完整旧失败和所有分阶段SHA保留。
独立metadata/blob/hash/祖先/七维状态复审无新P1/P2，不冒称复审者执行过测试。
最终metadata提交后执行精确e01a守卫；实际完整HEAD、结果与remaining dirty以ignored
outputs/order-source-disclosure-current-20261024/的final-exact-main-guard.log、final-guard-result.json及final-local-checkpoint.json为准；
缺少终态回执时不得称最终Guard完成。本阶段未触发Actions或远端写入，#125/API例外边界保持。

本地等待发布检查时已只读核对后续依赖：G5原54创建UI/后台及aaf引用清单纠正、0033可作为下一独立切片；
交期维护需原0042回执与fresh-actor等中间依赖，不能仅搬最早7584或整段旧8f。下阶段重新核实实际代码，
保留当前报价验收/金额保护与手机双操作最终修复，不重问已获批准的交期交互或旧业务口径。
