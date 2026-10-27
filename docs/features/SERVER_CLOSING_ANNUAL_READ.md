# 全年关账调整参考读取（D172）

2026-10-27，Gate8G2c，承接D169已批准界面与D171月份财务关联。没有新账本、价格渠道、币种转换或年度写命令。

## 读取与口径

`GET /api/v1/closing/year?year=2027`仅可信session；fresh权限要求closing.view/order.view/schedule.view。year必须明确；scope为all/internal/outsource/unassigned，production为all/not_started/in_progress/completed。search空格分词且匹配订单、款号、客户/品牌、合同/客户参考等业务文字，不搜索金额。offset/limit仅影响明细，最多50；12个月和全年合计使用同一筛选后的全部片段，不能随分页变化。

开放月份使用当前月份计划与实际已采用商业行，basis=current_adopted_order_reference；这不是财务认定。成衣CNY按显式期间税率计算，加工USD直接用已采用工价，不重新测算或换汇。加工SO不适用成衣销售价，合同工价与加工服务在目标加工产值中共同汇总；不另列第三项。

confirmed/locked使用原allocationManifest及版本和当时价格、数量、税率、颜色、执行方。不能用当前Quote/CCT、当前Source量或当前商业资格覆盖冻结金额。frozen_financial_snapshot标识清晰；当前款号/客户/生产状态只是参考，orderMetadata明确区分。原快照生产引用与当前事实比较，confirmed需复核、locked保留并提示；changes为空时不把“已保留快照”误报成“发生更正”。

金额分项权限投影覆盖明细、月/年总额和已知小计。未确认价、非USD工价、缺税率、Source/归属待核对、未知量与真0分别表示；只要适用片段有blocked，总额为null/incomplete，并给可见已知小计与原因计数，不能把未知补0。没有任何适用片段的范围可以显示数学空合计0；不以此替代已有未知片段。

scope使用保存的月份执行归属或财务快照；未分配明确单列，不从排单比例猜。生产状态只取真实累计完成和实际执行记录，只有计划不视为已开始；状态筛选不改变关账数量，也不按完成日期分月。未分月片段不硬塞当前年/月、不计入已分月合计，pendingNotAssignedToYear单独说明；冻结默认月中新建的不可表示量也必须保留可见pending。

## 一致性、容量和边界

一个REPEATABLE READ READ ONLY快照中读取，复用月份状态、商业资格、实际生产与精确金额函数。内外发、状态和搜索筛选同时约束明细与合计。最多500个候选SO/5000片段，过限明确拒绝，响应1MiB；不静默截取一部分再标全年合计。SQL单statement超时15秒不冒称请求总时限或500订单性能压测。辅助提取保持原单SO月份读取的事务/权限/响应。

当前是后端只读API，未接年度严格客户端、月份HTTP写协议、导航或React。没有改Browser、Quote/PV/CCT、财务版本、生产/来源量或任何现有库；没有真实Source查询、用户账号操作、合并、正式部署、环境切换和旧资产退役。旧兼容写入口尚未整体关闭。

实现：annual-contract/model/service、原closing/routes、month-plan-service内部读取提取。合成owned PG/HTTP、价格资格/冻结/过滤与更正正负控见[当前阶段](../tasks/active/closing-annual-read-2026-10-27.md)。实际检查分源，不借前G2b163/旧G1发布套件或旧镜像结果；68能力状态不提升，完整Goal继续。
