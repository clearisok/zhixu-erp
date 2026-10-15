# 6086941 两合同有界查询与完整分页诊断

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。GitHub为实时工程事实源；源码、来源/字段、授权、PR或验收变化时更新。

## 工程基线

沿用erp-followup-governance现有Source工作树，从feat/ainuoke-payment-request-read-model@fbb6002f6b8fc0257bca72c3bd4e4ae07488f0a7/clean建立feat/ainuoke-payment-contract-probe；父分支及全部B2/Quote/旧refs和私有文件保留，没有新建工作树。沿未合并G5和诊断依赖继续，不冒称main的独立小增量，不直接建议合并累计代码。

## 已确认事实、用户决定和候选

D136仍只确认两个精确样本的出运分配含义、个/CNY，以及cgGoodsAmount/PayAmount/GoodsAmount沿对应采购合同币种。固定首页已有100/17675和49字段证据，不重复Discovery或全量读取。两个真实样本的单据/物料/数量不入Git。

本阶段只实现D121 Gate5的下一技术核验工具（D137），没有新增真实读取授权。ExpContractNo字段名来自已捕获元数据，is为既有请求构建器的精确匹配操作候选；空dbTableName沿既有协议，不猜新表/SQL/flowName。尚未证明艾诺科确实接受该过滤，必须通过真实返回核验，不能拿合成通过宣称已连接。

## 已实现

- 复用AinuokeClient与build_report_request，固定6086941，不注册Bridge/持续Source catalog。既有ReadFirstPage仍仅首页100行、2HTTP/1report；新ReadContracts是独立、互斥、显式动作。
- 两个不同销售合同，只从用户已确认、受保护文件的精确SHA取S1/S2，连同申请/采购合同/id三个正向样本证据。与本次来源账号指纹不符，在登录前停止；不以款号/数量猜身份。
- 每合同最多2页、每页100行，每次必须完整两遍；总最多8报表/9HTTP、每响应4MiB、累计报表原文16MiB（另有1字节超限探测）、worker180秒/96MiB、父终端195秒。无自动重试、续期、第二账号或Discovery。剩余字节预算限制下一次read，不能先读超再声称受限。
- 所有行必须精确属于所选销售合同；每页应有的行数、total、分页顺序、两遍内容和正向样本都核实。空响应不能证明已正确过滤；超限、混单、缺页、重复整页、缺见证或两遍变化均失败，不静默过滤/去重/补0。
- 同页真实重复行保留，id不当跨时间主键；精确JSON数字文本保留，不求数量/金额合计，不混用字段或推银行付款。
- 安全、可解析的失败页也隔离保存，包括API错误没有rows/元数据的情况；解析/凭据回显/超限等不可安全证明的原文不保留。失败回执给闭合代码/阶段/实际应用层请求数，不反射原文。拒绝页不能成为正式Projection。
- 已有PowerShell入口复用凭据、ACL、Git忽略目录和子进程逻辑，新增SamplesFile/ExpectedSamplesHash；先核样本元数据再读取私密凭据。Node复核ACL/hash/文件身份，配置经匿名stdin，不进argv/env/报告。Windows短路径与长路径用native物理路径核实，仍拒绝reparse叶和范围外样本。无运行时依赖自动安装。
- Node不支持精确JSON源文本时，在向采集worker发送凭据前失败；非零退出不能伪装成功；超时终止。所有接纳结果仍mappingVerified=false、sourceActivation=not-activated。

源码：server/ainuoke-source/payment-request-contract-probe.ts、Python同名模块、既有payment_request_probe.py transport与scripts/ainuoke-payment-request-probe.ps1；Source CI增加test:ainuoke-payment-contracts。没有UI/API/SQL/正式快照写入或账号修改。

## 实际验证

79项相关Node（47原首页＋13观察模型＋19本阶段）、114项Python通过；包含真正Python→Node GBK管道、Windows私有终端/ACL/收据、精度、错误页隔离、并发无关的进程状态、超时和分页负向。typecheck/Server编译/全源码lint（排除继承outputs私有生成物）通过。898项目/94基线与精确main门禁在证据前向绑定后收口，不预填PASS。

原私有确认文件SHA212481539bf342aef5899658199bf20d95e76331a3c3d32983a1a0e768c60e02已由新读取器离线验证，2目标/S1,S2，selectionHash66d318aee2d8377bada020461c6ef97918972c7aca0e29a88483a7b74ac253c0。0HTTP/0DB，未访问凭据文件，没有执行ReadContracts。

## 待明确授权的下一次真实范围

仅上述两份样本对应销售合同，固定6086941、同一已提供私密凭据文件、一次运行；按上限完整两遍，最多9HTTP/8report/180秒，不读其他报表/Discovery、不自动重试。真实单号仅在聊天授权或本机私有选择文件展示。既有授权次数全部用完，本阶段不能自行执行。

若真实核验通过，仍只是这两份合同的观察完整性/过滤证据；下一步独立做整代快照持久化、有效SO/fresh权限读取和原事件侧栏。无需先逐条人工验收全表，也不因此启动金融去重/汇总或银行实付判断。真实业务DB、Source首绑/激活、旧四单窗口、宁波/18443/18444及部署仍不在授权范围。

Git NETWORK_DEGRADED，未自动恢复/重推/创建PR；原父分支命令仍对应其保存的ref，当前工作树需用本阶段最终branch/HEAD交付，不能运行不匹配的旧命令。不自动合并。工程通过与远端/Hosted CI/产品人工验收分开。

## 2026-10-15 最终本地验收和复审

源码/工程证据c8b92dce08b4f0c91f47544cc02ddd359cd4ec60；绑定提交d669e2e14b200e755fb2ae4c6348842c72593737/clean。79/79相关Node、114/114 Python、898/898项目、94/94基线、typecheck、Server build及源码lint通过；精确main064e3afaf7d08b3cb62907d4402f97d9c292f1e5守卫PASS（11页/38能力/53继承UI路径）。之后仅当前摘要更新，不将其冒充新产品构建。

新增文件对原100行8类私有业务标识的扫描0命中，原报告hash不变。新加载器与原捕获进一步离线对照：账号指纹一致，S1/S2各有唯一一条精确id/申请/采购合同/销售合同见证，0HTTP/0DB，不只是数量碰巧相等。未读取凭据或实际执行新模式。

本地复审结论：工具可进入一次有界真实核验；查询上游效果未获实读证据，不声明正式财务来源已接通或解除UI待接入。仍需新明确读取范围许可。完整PR远端交付待Git网络恢复；不建议将未合并依赖累计代码直接合入main，不自动合并部署。
