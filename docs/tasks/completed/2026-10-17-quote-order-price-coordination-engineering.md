# 报价与订单价格协同：本地工程交付证据

日期：2026-10-17。批准范围为 [D145实施任务](../active/quote-order-price-coordination-2026-10-17.md)。本文件是新证据，不覆盖原计划、D144记录或旧测试/部署事实。

## 基线与交付拆分

GitHub main 最后只读核实为 `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；未合并任何PR。当前整合验证源码为 `5ca54e2dfba3c88164f6b2eb7f9c3cdbecb9f160`，工作树起点干净。此后文档与发布证据收口不改变业务源码。

| 阶段 | 本地分支 / 精确提交 | 交付状态 |
| --- | --- | --- |
| 确认来源统一 | feat/order-commercial-versions / e70deacfe446088677aa3d96e998436b730cb7af | 更新现有草稿PR110，远端仍e3cebb48622e39cf2d31ca82bce4a3f971c973ee |
| 报价唯一来源与颜色匹配 | feat/order-business-source / da46cdeb70e3785a760d6381c2e4974a57668a2a | 更新现有草稿PR117，远端仍dc03670256b05dd24e0a9c817d1e138f353b1f1f |
| 统一成衣订单议价 | feat/quote-order-sale-adjustments / 02e1eca080d91bf878bee9deb3817067e60bf90f | 新草稿PR待安全交付后创建 |
| 加工同步与选择 | feat/processing-quote-push-and-selection / 5ca54e2dfba3c88164f6b2eb7f9c3cdbecb9f160 | 最终整合，全部上述原提交均为祖先；新草稿PR待交付 |

首次可靠checkpoint交付曾发生不确定传输失败，独立API核实仍为旧head；当前NETWORK_DEGRADED。没有后续反复push，没有使用文件API伪造原提交。上述新代码的GitHub CI均未核实，旧PR绿色检查不代表这些提交通过。

合并次序：先按实际增量评审#109身份基础、修订#110，再处理#111/既有来源依赖与#117，之后议价、加工增量。#117继承的来源/财务工程原依赖保持，不能把整个累计分支当作一个独立小改动直接合并。新增两PR到main保持草稿并标明依赖，增量审查基点分别为da46cdeb和02e1eca0。#108、#112–116未加入议价逻辑；#114最新远端4b7ac1e8e8806bb62cbb24c292ad57bd99c43b00并非本轮整合祖先，不能宣称它已被整体吸收。不自动合并任何分支。

## 已实现的产品行为

- 现有CCT存在时其值（含null）为权威；仅在不存在CCT时采用可证明的保存PV确认。列表、详情、汇总、导出及商业采用共享解析器。订单关联不改变报价确认读写渠道。
- 合同SO仍由可信合同接纳；订单详情的“维护来源”使用1280px居中分步弹窗，分页搜索按空格分词且匹配。只新增报价来源；历史翻单快照保留。报价/修订下可为不同颜色匹配精确方案，订单中心仅允许首次确认采用。已有价格的改配只能在报价上下文执行并校验调价/采用权限，不能借来源保存覆盖议价。
- 订单商业版本仍是成交价唯一权威；0028扩展不可变颜色行，不新建另一套当前价格表。颜色身份不依赖数量、交期或整行来源哈希。新增/重复/改名未能唯一识别时阻断或待匹配，旧版本不重构历史颜色。统一价摘要避免重复数字，差价显示逐色/方案明细；同价不同方案映射保留。
- 报价中心单笔和批量使用同一议价服务（最多25订单）；金额增减、百分比、统一价及逐色覆盖均先预览。只改变成衣成交单价，工价、币种、产品条件、CCT、成本、PriceVersion不变。0029只记统一操作及逐单回执；每单所有颜色/head/审计/成功回执原子提交，批量部分成功，重试不重复。三处历史读取同一记录。
- 已完成/取消、命令暂停、历史重复限制及金额权限保持；调价不授予工价或成本权限。旧共享订单CCT写入口与多色伪单价适配拒绝；旧统一价按历史统一价显示。没有完整Server关账能力的新增或冒称。
- 加工仅呈现报价/确认工价，面辅料/成衣/相关派生金额与Estimate不进入页面、API投影、客户XLSX和内部汇总；原保存事实仍在CAS基线恢复，隐藏字段不会被空数组或省略清除。通用PUT仍禁止改变报价业务类型来绕过受保护流程。
- 报价“更多→推送加工订单”进入统一选择模式，第二步编辑公共款号/交期与精确方案数量/确认工价。同步Quote/CCT后复用0016批次登记/确认/消费；0030仅回执。单个Quote为共享字段原子组，跨Quote部分成功；已有批次只读，新旧批次分组。已消费批次返回原SO，明确“客户确实再次下单”才建新批次，不以Quote ID全局去重。
- ZIP、内部汇总、加工选择固定最左侧，保留跨页选择，退出紧邻生成/确认按钮。大弹窗内容使用完整宽度，窄屏操作换行。报价普通导出不混入某单议价结果。
- sessionStorage只保留公开用户范围的请求UUID/必要Quote IDs；不存金额、原因、令牌或凭据。未知回执先核对，不把not_found当作肯定未写；受理前网络失败仅允许当前内存中的原命令重试。明确受理前拒绝清理待核对标记。

## 验证记录

所有数据库均随机一次性tmpfs合成Postgres；浏览器为隔离Chromium临时profile和合成账号。没有读取真实凭据或新来源数据。日志位于本机ignored outputs，未随代码上传。

| 验证 | 结果 | 源码 / 证据范围 |
| --- | --- | --- |
| 完整项目 npm test | 898/898 | 5ca54e2d；含94项基线回归 |
| 完整Postgres npm run test:postgres | 261/261 | 87f08395；Auth、Quote、CCT、升级、导出、附件、S3/MinIO、审计等 |
| 专项领域组合 | 81/81 | 来源/颜色/商业/议价/加工及升级保护；稳定核心源码 |
| 实际Chromium最终四套 | 26/26 | 5ca54e2d；来源7、议价5、旧批次8、新加工选择6 |
| 类型、完整lint、Node编译 | PASS | 5ca54e2d |
| 默认Browser / 显式Server构建 | PASS / PASS | 5ca54e2d；没有改默认运行authority |
| 分支独立检查 | PASS | #117来源7浏览器；议价分支12联合浏览器；前阶段类型/API证据保留 |

PG全量之后的源码增量只有公共来源body上限8192→262144（与1000颜色项领域上限一致）、受影响Modal布局和JSX属性顺序；1000项预览专项验证仅返回领域冲突且零写入。最终26浏览器覆盖了此边界。没有将PG全量描述为在文档收口提交上重新运行。

本机最终日志：price-coordination-final-root.log、price-coordination-postgres-final.log、price-coordination-final-domain.log、price-coordination-final-ui-26.log、price-coordination-final-typecheck.log、price-coordination-final-lint-2.log、price-coordination-final-api-build.log、price-coordination-final-browser-build.log、price-coordination-final-server-build.log。源码门禁在本证据checkpoint绑定后再运行，最终结果记录CURRENT_STATE/AI_HANDOFF；本证据不自引用未来SHA。

复核了旧0015/0016/0027的Git blob，分别仍为85046a1f311c74abf06e2e175851667d435f8cb2、0bf443992f19b74fe97fd076449405799d002e21、3cdd765e52fd762e46e01763a53c475724458505，与原PR精确提交一致。0028/0029/0030全部前向新增。旧商业快照、创建身份、流水引用及Browser namespace不回填、不重建。

源码复审重点：来源重选不能从订单API绕过调价权限；CCT存在的null不回退；加工投影不是存储清空；两个入口仍共用稳定批次消费；成功丢回执重试保持原请求；金额仅按字段权限返回。发现的多方案空header、迁移ledger、选择列、完整宽度与窄屏恢复操作问题均已修复并回归。

## 能力与安全界限

implemented=yes、isolatedTest=passed-historical仅描述本文件限定的本地工程。merged=false、humanAcceptance=not-run、sourceActivation=not-applicable；trial18443/preview18444均not-deployed。历史环境SHA/image沿用原冻结证据，没有重新观察或部署这些环境。

未修改真实账号、已有业务数据库或本机62316/62326演示；未采集艾诺科、扩大Source预算、首绑、激活、持续调度、部署宁波/18443/18444或执行历史归一。回退优先关闭新命令并保留已产生商业版本/身份；没有声称可无条件切回旧镜像或删除新表。真实升级、旧业务人工验收和新head Hosted CI均需后续具体操作与核实。
