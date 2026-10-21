# Gate7C准备：成衣出货来源只读客户端与页面

2026-10-22；D147已批准Server收敛工程，D152/153数量日期/观察边界不变。本文件保留接线准备及第一切片实施证据，不是新真实采集/target激活、部署或人工验收许可。root唯一writer，既有reviewer只读；分支/完整HEAD/main/dirty baseline见下。

## 实施起点

本轮起点独立GitHub API再次核实main996dfedc12da3527343cd3ff2aa5eea35497e10e；原codex/garment-contract-filter-verification在2612bf8697679fcaa26ff8aac8e81a450b05428f干净。新分支codex/server-garment-shipment-read-ui从main建立，再只FF完整2612输入，无reset/rebase/force。原根摘要三份逐字节归档到tasks/completed/2026-10-22-garment-read-inputs/2612bf86/，均为普通工程文档，不读取真实私密报告/凭据。

上一轮为progress：Gate7B实现、测试、独立复审及源码384远端精确核实完成；本轮先观察Team/Baseline success、Source live，后按原39644366031/head384核实Source终态success（全步骤含原P6、Quote、Python均通过），故三CI现在全通过。原Git push STOP/原因unknown继续保留，不重推384或自动写新远端；本地独立工程可在已验证输入上继续。

第一切片限定model/client、原快照expiresAt与合成测试，不增加路由/数据库/Source调用或修改Browser。页面为后续同Gate独立切片，未实现前不能记为UI交付；真实额度已询问未答复，不以等待额度阻塞合成工程。

## 已验证接口与复用边界

- `garment-shipment-store.ts:216`的freshness来自原snapshot `observedFrom + stored freshness_ms`；当前DTO只有标签/evaluatedAt，没有expiresAt。计划前向追加expiresAt，绝不用observedThrough、当前target策略或payment固定600000替代。前台用单调时钟扣除请求时间，到期只转“已过期／历史观察”，不清空仍有权限的模型。
- 当前与历史详情都可为`observed_empty`，带完整快照与时效；不能套用payment客户端“非空observed且过期清空”的业务断言。仅借鉴有界读取/单调钟技术，不复制付款字段、金额或十分钟规则。
- `history`先LIMIT26/取25，再过滤当前绑定，因此合法`records=[]`且`nextBeforeGeneration`非空。依据游标翻页，不以空页认定结束。摘要是不可变索引，打开后按精确publicationId读验证详情；当前与历史选择分别保存，不能用旧详情替换当前。
- 读取仍需order.view+ainuoke.view。过期历史保持不等于撤权后保持：401/403、identity_changed、来源停用、注销或scope变化必须隐藏旧内容。默认503只影响出货局部；加工不适用、历史alias不自动换SO请求。
- 前端响应必须独立出货DTO校验（是响应完整性检查，不是授权/来源过滤证明）。数量保持字符串，零/负/未知/无效分别显示；outdate是civil date，不换日或用其他日期补造。拒绝额外字段尤其wxprice/金额，容量要覆盖合法16MiB公开payload与外层元信息，并用真实合成边界验证，不截断。
- 使用`features/style-progress/server/use-material-arrivals.ts`现有layout owner/epoch模式；owner涵盖session对象、订单、开关、请求序号和所选publication。关闭到passive cleanup之间、A→B→A迟到200/401，先核对owner才改状态/注销，不照搬payment字符串scope。
- 订单详情billNo实际为可信销售合同号，出货行billno是出货单号，二者不能混用。颜色展示冻结colorMatch，colorBasisChanged/targetPolicyChanged独立提示，不根据当前颜色重配、不计算出货完成率或收入。

## 建议实施顺序

1. 复核实际DTO/订单model/hook和现有Foundation，先完成非视觉model/client、只读expiresAt及测试；无新schema、HTTP writer、Source配置或Bridge接线。
2. 再复用订单详情的紧凑折叠区/表格与历史抽屉，正常文字表达来源观察、单据、颜色、原单位、Num、outdate和捕获时间；无新调价/确认完成/关账/真实刷新采集入口。只刷新本地GET。
3. 精确UI影响路径按既有release guard前向记录，绑定D147批准的Server接线范围；不改原截图hash/默认路由或把工程截图记作用户认可。没有真实数据时保持明确空态，合成验收不伪装真实采集成功。

最小负测：途中到期/时钟倒退、原策略与新target差异、空观察、空历史页继续游标、跨单publication、额外金额字段、容量超限、关闭/换单/A→B→A迟到响应、撤权/会话变化后旧内容隐藏。随后类型/lint/build、相关PG/HTTP、built浏览器六尺寸/精确发布门禁及独立复审；只用一次性合成库与自有测试运行时，保护所有现有体验环境。

## 依赖与待决

该只读接线可依赖已收口Gate7A内部观察契约，不依赖新真实读取或上游激活。正式collector/target启用仍须另有过滤/分页证据和具体许可。Gate7B固定C1/C0/C1额度已单次询问但尚无答复，不重复询问或提前读取。关账加工归类、旧CNY工价和完成更正复核仍待原问题，不在本切片决定。

独立reviewer本轮静态预审给出以上六项边界，无新业务阻断；未实施、运行测试或读取真实文件/凭据/Source/业务DB。

## 第一切片实施与验证（进行中）

开始HEAD441edd614c911475c55049342108a70a60f72523、工作树干净。新增共享公开model、独立只读client；原server纯函数原样提取且re-export兼容。只读store追加原策略expiresAt；history HTTP语法从九位扩展十位、store继续限制1..2147483647。无SQL/migration、开关、Catalog、UI组件或运行环境变化。

合成首跑40客户端检查通过；初次typecheck两处TS窄化错误已修正，随后typecheck通过。定向命令包含原纯观察、客户端、一次性PG/session HTTP和0039→0040非空升级，共81通过；lint通过。第一次误用不存在的`build:server`命令停止、未安装或改环境；核对package后实际`server:build`通过，原日志保留。项目与发布全套继续核实，不以定向结果替代。

独立复审发现两处枚举先String转换会误接数组（reason与colorMatch.state）；已加字符串类型前置及数组/嵌套数组四个负例，静态复核无剩余P1/P2，待修后运行复验。容量测试为16MiB理论传输上界加读取元信息的合成构造，非HTTP空白padding，也不冒称该最大构造已通过PG jsonb::text/原input发布。所有输入为合成，未打开旧私密候选/凭据或发真实请求。日志保留ignored `outputs/garment-read-gate7c/`。页面/历史抽屉仍是后续切片。

第一切片最终运行：44修后客户端、927项目、116发布基线全部通过；修后typecheck/lint、实际server:build与应用build通过。81条原定向中的PG/HTTP/升级通过，枚举修改只影响客户端，四个负例另行全部通过。相对已核实main的工作树发布守卫PASS（11页/53能力，78累计UI路径）；这是含本切片dirty源码的检查，不冒称已运行浏览器。独立只读复审已闭环，无剩余P1/P2，UI/原始owner ABA及浏览器仍待后续实施。先独立checkpoint并核对精确提交守卫；REMOTE本切片pending，遵守原STOP不新增Git写入。

## 第二切片起点：原订单详情接线

第一切片提交1630c19ddd278a2026157ad092b337a11522b643、工作树干净，精确checkedHead发布守卫PASS；无远端Git写入。第二切片沿同分支从该HEAD开始，root唯一writer。复用原订单详情Card/DataTable与Foundation Drawer，不新建路由/全局CSS或变更主导航；默认收起、局部加载、当前/历史独立，历史摘要可空页继续。权限或来源范围失效后清全部观察，显式重新读取才再尝试；GET只读本地DB，不是Source刷新。layout owner同时绑定实际session对象、请求epoch、开关和所选publication，防关闭后迟到及ABA。

此为D147已批准Server化与成衣出货范围内的局部接线（见Gate0和原批准请求）；不改变D152/153数量日期/观察业务规则。V2精确影响记录须先于最终门禁，六尺寸/实际构建/权限与竞态合成验收完成后才记工程UI通过。尚无新真实额度答复，不读取私密报告或凭据；所有已有运行环境继续保护。

第二切片源码已接默认收起Card/历史Drawer、当前与所选记录独立、布局owner和失效block。typecheck/lint（初次一项effect依赖warning已修）通过，完整定向现85通过。只向原owned continuous fixture增加可选garment，既有默认行为不变；新built harness/既有Source workflow接入仅使用私有Chromium及一次性PG。先源码checkpoint，再以完整SHA显式Server构建，尚未运行浏览器或新增能力状态证明。独立复审进行中。

应用checkpoint3452efba13bb716160ee5892a71e37fd62c96750已显式Server构建（build20261022-021857）。初轮built浏览器11个业务阶段通过，含六尺寸/准确量日/空游标/关闭与ABA/单调到期/403/target停用；最后七角色循环因新页面瞬间body=null的harness等待表达式失败，根父test也记fail，未改成PASS。原日志及15张初轮PNG保留ignored目录。已修等待为null-safe且逐角色fresh-document marker；截图先等待实际记录，避免拍到关闭历史后的局部loading。仅将本区块按钮/LoadingState收紧为既有compact选项；新源码checkpoint、重建及完整浏览器复验继续，不覆盖旧图。

第二切片静态复审无剩余P1/P2；403注入仅证明前端清理，不冒称本阶段真的改角色后撤权；七角色将另验实际session读取，后端权限/撤权证据来自85定向的原PG/HTTP测试。修后typecheck/lint通过，原continuous默认fixture回归运行中。无真实Source或数据操作。

43989d1acf0c48e6244640d6f1d8a58736893136/build20261022-022257的13项built验收全通过，含7个实际合成角色；默认continuous回归70通过/1既有Windows跳过。随后实际查看桌面、手机、手机历史及桌面详情PNG：无文档溢出，但桌面窄Drawer的宽表需横滚才能看数量。主动将历史详情改为同一Foundation Card逐笔排列，当前桌面仍用表，精确长数量允许折行，未知日期不重复前缀；只改局部展示。harness新增历史卡量日完整且无横溢出断言、截图避开固定header。该小修另checkpoint/重建后重新完整验收；旧439截图/13PASS不冒称新视觉修正已经验收，旧失败/图片一并保留。
