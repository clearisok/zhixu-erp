# Server单订单成衣受控采集控制层

原2026-10-23切片，2026-10-24向main e01a11952b648024c0bd6bf4259de429374981e2当前候选受控前移。承接D147/D152/D153，新增D158内部工程，不是来源激活、操作者入口或真实读取许可。
原[0040不可变观察契约](SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)及冻结历史保持原字节；当前验收见[本阶段任务](../tasks/active/server-garment-collector-current-2026-10-24.md)。

## 唯一owner与入口

复用原可信Source/合同/SO、稳定颜色、原0040发布/GET/权限和归属规则。
planGarmentCollection、collectGarmentOnce、readGarmentCollectionReceipt仅Server内部调用，不注册HTTP、公开CLI、Catalog或scheduler。0043仅新增空技术命令表，不seed、不回填、不启用target，不修改旧SQL或Browser存储。
发布函数提为caller-owned事务primitive，旧wrapper仍同步捕获全部输入后开启原事务，不改变旧重放/锁序/CAS/实际JSONB容量或GET语义。原账本不被复制为另一套成衣出货模型。

## 精确范围与单次预算

只读plan在同一RR核对fresh order.view/ainuoke.view/ainuoke.sync、操作人、可信合同和原物理来源身份；绑定实际DB/连接、原SO/link/有效归属、target版本、颜色/head代际、过滤证明及requestId/有效期。
从本账号/本合同C1/C0/C1完整原文重建过滤证明，目标verification_sha256须精确匹配；非空hash、contains候选、款号或另一合同/账号不可替代。plan不是人类授权。

首版worker只允许6086979的ExpContractNo/is/[内层]，单合同两遍完整首页，各100行；最多1登录+2报表/3HTTP、4MiB单响应、8MiB报表、180秒，零重试、翻页、重登、重定向或代理。总数>100第一遍停止；正式pageIndex/pageSize必须1/100，不把诊断零哨兵补成正式值。该工程天花板不扩大已消耗的D1933/D1935真实授权。
Python严格提取后，Node再次从原文hash、无损JSON、完整计数、精确合同和两遍内容重建。空观察合法，不要求旧见证持续存在，不以消失作取消；Num/outdate、负值/未知、单位和日期独立，不跨观察累加或自动关账。

## 持久请求与原子终态

同actor/requestId只允许一个worker。必须先提交started并确认COMMIT，采前等待后再次核对许可未过期；started不回收、不作为重采lease。任何started回执未知只核对原请求，不再次采集。
网络期间释放所有数据库事务/锁。采前复查scope，采后fresh鉴权、冻结完整物理组、重核原target/合同/颜色/CAS。快照、颜色、head、原发布审计、命令成功终态及命令审计同事务；终态或审计失败全部回滚。
只有发布回滚已确认时，才允许单独保存小型not_published技术终态；这是同一请求的失败记录，不重试worker/发布。COMMIT回执丢失返回unverified，不把ROLLBACK尝试当已失败或允许重采。未知计数不补0。

回执重新鉴权并重建scope/payload/hash及封闭结果形状，原actor/UUID历史不因permit过期、target关闭或head前移而改写；不返回任意JSON、凭据、原文、颜色全包或金额。原SO及sourceOwner双引用加入完整归一指纹，但不开放归一执行。

## 当前前移和验收

14非doc路径：12原输入精确、package/workflow只新增测试命令；control及其集成测试带入d99282晚修复（最终只读等待后的expiry检查、publicationRollbackConfirmed语义、另一actor隔离测试）。41份旧迁移完整hash保持，新增0043；旧migration版本最大42与文件数41不混同。
本轮source后新单元/真实PG/非空0042升级、原store/HTTP/引用/权限、Python FakeTransport、类型/Node/lint/发布134及精确main守卫另冻结，尚无新PASS，不借旧31/181。前端无改，只按fc103原范围复用217产物/37built排单UI，不称新build/browser。
默认关闭、未读真实凭据/报告、未发外部请求、未操作现有库/账号/卷或部署；真实操作者入口/额度、激活、多页实证、跨次事件、50426切换与关账待决项另Gate。

## 依赖闭包校准

初次ee210仅14路径的输入相等不证明依赖闭包。独立预审在任何QA前发现缺少严格JSON/合同过滤证明模块，未将该source称可编译或PASS。现只按原49dc的精确函数块提取无IO的Node证据验证器、原无损JSON模块与Python定义/screen，三个import改指新纯模块；不带冻结候选/凭据读取、诊断collect/main、私密报告写入/launcher或新HTTP/CLI/Catalog/scheduler。完整C1/C0/C1、重复键/精度/64层检查不削弱。另仅取357a88e5升级断言使用既有明确迁移清单；新增纯验证与Python screen负向测试。提取块hash/边界在本轮outputs dependency-extraction.json，尚待新QA。

## 证明枚举类型修复

独立复审在d2ff发现原提取函数以String(result/workerStage)枚举、后续却严格比较原值，数组complete可跳过完整页数/请求校验。新增验证器和garmentCollectionProof两项直接回归，原产品定向实际2/2失败（1177ms），保留proof-enum-red.json/log；不是全套测试失败或真实来源事故。仅两处改为typeof string后精确枚举，数组/嵌套数组、空pages与零请求不能冒充完整C1/C0/C1证明。原scalar成功/失败与预算、SQL、publisher、Python、入口/Source范围保持。旧d2ff全量QA属于修复前源码，修复后仅重验受影响4文件/类型/Node/相关lint；不将旧结果冒称重跑。最终新source验收后另冻结。
