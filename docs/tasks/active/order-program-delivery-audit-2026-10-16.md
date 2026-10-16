# D121 已批准计划：工程交付与剩余边界复核

核实2026-10-16；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。依据实际源码/测试、冻结报告和最新GitHub PR精确head；GitHub为实时事实源。源码、PR、人工验收、真实环境或授权变化时更新。本文件不把历史活动文档中的早期待办当作当前未实现，也不把本地候选当作main/部署能力。

## 逐Gate对照

| 原计划 | 已有工程与事实证据 | 仍然独立的边界 |
|---|---|---|
| G0规则/基线 | D121、order-identity-program；旧报价直转分支保留，0013占位不改已发布SQL；独立Gate提交与原worktree均保留 | main仍064；没有真实历史扫描/升级授权 |
| G1合同类唯一创建、认领/血统/准备 | identity-model/service、可信source接纳；order-identity与UI回归；准备不分配SO，后补血统不改执行事实 | 实际团队认领及数据验收未进行 |
| G2不可变商业版本 | commercial-source/version-service/projection、legacy-preview；同报价多SO、显式换价、权限/CAS/冻结/删除来源负向；旧共享Order写价拒绝 | 历史价格切换仅预览/隔离演练，未知历史不冒认下单价 |
| G3加工批次双入口 | processing-batch-service/model、SQL0016及两入口共用dialog；请求幂等＋批次唯一消费；多批次复用报价、部分成功/失败项重试、候选分页/相似提示 | 不导入真实加工业务；Quote不是一次下单身份 |
| G4归一与恢复 | normalization-full-evidence/execution/review-workspace/effective-attribution；SQL0018–0023、command-control/source-history/preparation-adoption；原身份/引用保留、消费者fence、独立复核、完整组纠正 | 真实外部生产/财务coverage adapter默认unavailable；执行许可/真实案件/备份恢复须单独核实，不能把空Server表当0外部流水 |
| 准备采纳/历史类型/规格查漏 | preparation-source/adoption及UI；非法processing标签保持unclassified；新Revision的所有PriceVersion.confirmation=null，附件继承不是价格确认继承；quote-version-workflows集成有断言 | 不迁移Browser账本，不扩大完整Server生产/关账模块范围 |
| G5原批准页面/排序/事件 | material-display、material-progress-settings、来源reader；顶部返回/款号/重复说明、面料先/辅料关键词、规格颜色展开及事件侧栏；已批准像素/七角色/屏幕矩阵见PR114冻结报告 | 人工像素验收仍独立，未更改原批准布局或截图hash |
| G5 num_dyc | 既有6087050 Adapter/Pipeline/Projection，逐事件多余仓独立保存；原业务确认只在匹配身份使用 | 不把多余仓加回rknum或推算库存，不作全局单位换算 |
| G5 6086941 | 独立字段/精确数值/两合同worker/快照store/合同级read panel/collector/operator；原数量金额字段独立，D142持久单次回执 | 12/9真实行与两遍一致只证明该次过滤；整体映射、所有单位/币种、银行实付及持续激活未确认 |
| 小范围真实演示准备 | 新D143固定预算/逐行合同身份，13 Node/131 Python；clean 71b源码Server镜像已构建并只读核元数据 | 新数据库/首绑/启用/真实刷新尚未执行；提案必须另获确认，不续旧窗口 |

上表中的工程由对应测试/冻结证据与精确CI支撑，不是宣称所有测试本轮重跑；本轮只重跑新模块、原来源相关、根源码、基线和CI注明的范围。完整Server排单/生产/关账并非本计划新增的迁移任务，不能因此把Browser执行数据混入Server或称其已上线。

## 最新远端及依赖

本轮逐个API重查以下head；109–114每个精确head的source/baseline/team-access三项SUCCESS，115三项亦已核实。全部未合并；仅109为非草稿。

| PR | 精确head | 职责 |
|---|---|---|
|109|7ef6e665886c937cb01cf82ed2700e33029746fe|G1身份/合同认领|
|110|e3cebb48622e39cf2d31ca82bce4a3f971c973ee|G2独立商业版本|
|111|4da3590b46e201857223c09bb951331196ba352a|G3加工批次|
|112|4c59d974edd29cc82798884e70ff7586319f95ac|G4归属/历史/准备与复核|
|113|3896d66837a25875cf9c364126cfd6c804250b80|G5/财务受控采集累计依赖|
|114|4b7ac1e8e8806bb62cbb24c292ad57bd99c43b00|G5页面独立候选|
|115|db4236cf63839e4f384ad042e1ac21ad42fd01f1|D142财务单次操作|

新selected-source-once以115为父，独立增量，不重复创建已有PR。按109→110→111→112逐项对齐新main、缩小diff、重跑精确门禁/CI再复审；113与114有共享祖先/累计页面，必须先比较实际包含关系再选下一项，不能盲目双合。115与新预算分支同理。未取得merge授权，不执行这些合并。

## 已确认、决定、建议和待确认

- 已确认：上述候选与精确CI/本地证据存在；订单身份、商业和Source工程已明显超过main，但没有真实上线。旧四单演示两个容器停止，volume未改，原因未验证。
- 用户决定：D121及数量/单位、取消、厂供、退库等既有明确业务确认保持；没有因新报告改写规则。HTTP风险已批准，不重复询问。
- 建议：先按[两合同具体演示提案](ainuoke-selected-demo-execution-proposal.md)验证同一隔离实例，随后再决定合并顺序和持续窗口。优先109作为首个范围清晰的合并候选，不直接合548文件累计内容。
- 待确认/未执行：具体真实读取/空隔离库写入/两个新SO与Source目标启用；人工业务/像素验收；真实历史价格/类型与归一案件的外部完整覆盖。没有授权即可做的真实业务迁移、账号修改或部署。

这些是明确的后续操作/外部证据边界，不得把它们通过改状态标签变成已完成。首次实机展示不要求先解决全公司的历史归一或完整生产模块；只要两单的可信身份、四流、财务观察、权限和异常提示可核对即可开展小范围人工验收。

本轮追加事实：PR114不是当前head祖先；实际生产UI差异仅后续D140合同级货款面板/三行CSS及日志枚举，G5已批准布局/排序保持。真实图形人工验收仍独立；新Source转义秘密值漏检已用双红测复现并修复，旧8d镜像不再作为真实候选。
