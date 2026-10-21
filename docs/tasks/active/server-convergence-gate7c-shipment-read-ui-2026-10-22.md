# Gate7C准备：成衣出货来源只读客户端与页面

2026-10-22；D147已批准Server收敛工程，D152/153数量日期/观察边界不变。本文件为下一独立切片的代码核对结果，尚未实施客户端、页面或DTO变更，不是新真实采集/target激活、部署或人工验收许可。root唯一writer，既有reviewer只读；实际实施前另记录分支、完整HEAD、main与dirty baseline。

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
