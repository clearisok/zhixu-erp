# 6086979成衣出运登记：一次固定首页真实核验

2026-10-21，root执行；阶段工具源码e8f979bd9aa223fae0f330723ffc2f8301b8dcd7，分支codex/garment-shipment-source-probe。用户明确批准一次既有凭据私密读取，且范围固定6086979、insideorderno contains D1935、首页最多100行/4MiB/120秒、最多1登录+1报表、失败停止。该次许可已使用完；不重试、不翻页、不扩大条件。

## 已验证事实

- 实际1次登录+1次报表、2 HTTP请求，成功；reportedTotal=0、returnedRows=0。只说明该时点、账号与固定条件下可见0行，不证明全报表或其他账号无成衣出运。
- 采集时点UTC 2026-10-21T05:17:51.436041+00:00，即北京时间13:17:51。原私密文件保留UTC；PowerShell最终回执按本机时区序列化为+08:00，表示同一时刻，不是出运日期。
- reportId=6086979，reportName=成衣出运登记明细表，dbTableId/sourceId=6083615，sourceName=v_STP_OutStore_Other，sourceType=2，38个cellList列定义（含id）。正常Report Catalog未增加该报表。
- 元信息onlyMyUser=true、mustLogin=true；这是上游配置标志，不能据此断言零行原因或权限实际覆盖。没有读取账号权限/提升权限，也没有绕过筛选。
- 原始响应SHA256：7fc5a8ea00ac74b79bf272d6862d5c57d78b47a31d77ef9bdbd66cebbe97af58。
- 私密包装文件SHA256：ddccf9243dd54c616ce6d7f48f94be7cb84d8386657a74ae813eb5dd730e3c0f。离线读回同时核对包装及原文hash一致。
- 原文仅在本工作树受保护ignored目录outputs/ainuoke-shipment-private-c1dbd017-75c8-4c56-a18b-347ac05f145a/ainuoke-garment-shipment-private-43354d76-563c-4b69-8a67-6938b90bcb08.json。不得stage、push、复制到普通报告或展示原文；其中上游账号/权限/SQL等不是公开证据。
- 0织序数据库连接/写入、0绑定/激活/调度、0部署/真实用户修改。结果仍mappingVerified=false、businessMeaningVerified=false。

## 元信息字段对照（不是行值映射验收）

下表只提取cellList.name及其itemList.fieldName，保留原大小写；不是从行值或业务公式推断。主控已离线逐项对照全部38列，同时核对采集时间、原文和包装hash；0新增网络请求。既有reviewer只读核对安全回执与报告边界，没有读取私密原文或替主控宣称独立逐字段核验。

| 显示列 | 原字段 |
| --- | --- |
| id | id |
| 公司抬头 | CompanyName |
| 单据号 | billno |
| 单据日期 | FDate |
| 客户 | CustomerName |
| 品牌 | Brand |
| 款号 | GoodsNo |
| 工厂款号 | insideorderno |
| 订单号 | CustomerOrderNo |
| 中文名 | CnName |
| 中文颜色 | CnColor |
| 数量单位 | QtyUnit |
| 订单数量 | styleNum |
| 裁数 | trimnum |
| 已出运数量 | ycyNum |
| 未出运数量 | UsableNum |
| 本次出库数 | Num |
| 总毛重 | TotalGWa |
| 总净重 | TotalNWa |
| 产前会议时间 | ppmeetting |
| 进仓日期 | indate |
| 出运日期 | outdate |
| B品数 | Bgrade |
| 分析原因 | Bgradereason |
| 实际生产车间 | factory |
| 溢装件数 | Overfilled |
| 是否出清 | isClearing |
| 销售合同号 | ExpContractNo |
| 色样安排时间 | syap |
| 色样确认时间 | syqr |
| 大货面料装柜时间 | dhmlzg |
| 到厂时间 | dcsj |
| 工艺单寄样日期 | GYDJY |
| 开裁日期 | KCDate |
| 成衣交期 | DeliveryDate |
| 外协 | wx |
| 备注 | remark |
| 外协加工单价 | wxprice |

## 基于元信息的推荐，尚未正式采用

- 将Num与outdate作为逐笔数量/日期的候选核验对象。ycyNum、UsableNum、styleNum、trimnum分别保留，不能相加或替代Num；FDate/indate/DeliveryDate不能回填为outdate。
- ExpContractNo是合同关联候选，仍须与可信Source合同身份精确核对。insideorderno contains只用于找候选；CustomerOrderNo不视为正式SO号，不通过款号/颜色/数量猜合同。
- id/billno/CnColor/QtyUnit需要非空真实行才能验证稳定性、重复、粒度和单位；不能仅凭id列名建立永久事件身份。38列中未见明确尺码/撤销/冲销显示列，但隐藏行字段和视图过滤尚未验证，不能据此认定不存在。
- factory是来源文字候选，不自动等同织序生产组/外发厂UUID。wxprice是上游外协加工单价，不替代Quote/CCT或订单已采用工价，也没有币种证据，不能默认标成USD或用于关账。

## 仍缺失及下一步

本次零行，无法验证一张合同多颜色/分批出运、同单多行、数值精度、日期业务时点、单位、修改/撤销/冲销及唯一行身份。正式成衣出货schema/Source映射/关账投影继续暂缓，不采用默认值或以当前计划补造历史。

优先向用户取得该报表中确有出运记录的工厂款号或销售合同号，确定新样本范围后再进行有界核验；不会自动取消过滤或读取其他款号。独立的物流基础资料Server工程仍可继续。

工具合成验收（Node82组合/最终12、Python142、基线116、types/Node/lint/复审）与本次真实核验严格分开，详情见[工具任务](../active/server-convergence-gate7-source-probe-2026-10-21.md)。精确e8f源码守卫已PASS，未执行新Hosted CI或Git推送；原工具非零交付STOP保持。
