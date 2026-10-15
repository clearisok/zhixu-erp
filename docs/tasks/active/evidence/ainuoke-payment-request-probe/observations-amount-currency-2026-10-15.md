# 6086941 金额币种范围收紧与最终工程复核

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；branch feat/ainuoke-payment-request-read-model。本文冻结，后续改变新增证据；GitHub为实时工程事实源。

## 已修复的复核发现

初版观察行的通用currency属性容易被后续消费者误用于所有金额。用户只明确确认采购金额cgGoodsAmount、应付PayAmount、本次申请GoodsAmount沿对应采购合同币种，不能据此确定BGAmount、kpamount、YFAmount、gnsk/gwsk及其他金额的币种。

现改为purchaseContractCurrency和逐金额amountCurrencies；只有上述三个已确认字段可以采用该合同币种，其余保持unknown。新增负向断言没有行级currency通用属性、三项已知但其他九项未知；不更改原数值、金额公式或CCT，不新增汇率。这是对D136范围的落实，不扩张业务确认。

## 实际验证

- 13/13观察Node通过（新增1项逐金额币种边界）；类型、Server编译和受影响源码/测试lint零警告通过。
- 96/96 Python、47/47原诊断Node、全源码lint（排除继承outputs生成物）在同Phase的前一工程检查通过；本次未改这些代码。
- a5cc95d62b70f0c11d0126174f19c936692dd3f7/clean已完成898/898项目、94/94基线及精确main守卫（11页/37能力/53继承UI路径）。本次币种范围补丁之后的最终证据绑定和回归结果另收口，不将前一提交冒充本次精确结果。
- 同一既有100行报告再次仅在本机离线转换：0HTTP、0DB；复用原人工确认文件，不新增来源读取或凭据访问。两行只有cgGoodsAmount/PayAmount/GoodsAmount得到CNY；其他金额字段100行均未被自动确定币种，其余98行采购合同币种仍unknown。
- 原报告hash d500982d3b6ba1b2cf408db4e626e4097d93c3570852398e3b911be98cbb80ae、原确认hash212481539bf342aef5899658199bf20d95e76331a3c3d32983a1a0e768c60e02保持不变；新私有观察hash0393cce74403f943f291a46f8beae6f6862a57d5d15edb418d25ac2c815beee1。全部仍ACL保护/Git忽略。公开[逐金额脱敏统计](observations-amount-currency-2026-10-15.json)。

没有新UI/API/SQL/业务DB/Source绑定激活/部署；旧观察/结果/证据未覆盖，不自动合并；Git仍REMOTE PENDING，无新PR/Hosted CI。

## AI建议：尽快可用的后续切分

先以已可信绑定的销售合同读取完整、受限的财务快照，按整代替换观察；页面只显示当前完整快照及原始单据/状态，不做跨时间归并和银行付款推断。展示前必须证明合同精确过滤、完整分页、来源/单位/金额限定和fresh权限；未知币种明确标注、不总计。不能把全表首页当某单无记录。

跨时间稳定业务id是后续增量去重、事件归并和财务计算的独立Gate；当前来源捕获和行身份必须可追溯，但不要求先让用户逐条人工验收17675行才做一张合同的只读展示。其他98行优先通过可信采购合同币种关联核对，不要求用户逐行补录。不会在本Phase解除侧栏待接入。

新真实读取范围/次数需明确授权；当前所有已授次数已用完。仍不重启旧四单窗口、不触碰真实账号/宁波18443/18444。

server/ainuoke-source/payment-request-observations.ts LF SHA256：ee5a5da8e5e3c3301a5f15647c18b00256000cb5aae08752dde51a104ca10c40

server/integration/ainuoke-payment-request-observations.test.ts LF SHA256：1ee574a03ffacb247534351934678adae21b85be10a4ad1ecfb3ed6032b9ff09
