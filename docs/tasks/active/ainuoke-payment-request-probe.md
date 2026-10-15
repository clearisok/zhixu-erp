# 6086941 面辅料货款申请明细：有界只读诊断

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；复用erp-followup-governance旧Source工作树，新分支feat/ainuoke-payment-request-probe从已验收68ac1fc9f839ebfc894d39377dac221e7f65566b/clean起。原feat/ainuoke-anomaly-evidence@21da670b619f9ad745b4818ffc0a4eb50b9a501e及全部私有报告保留；另一工作树B2等待网络交付核实，不修改其分支/HEAD/dirty。没有新建worktree或重复PR。

用户已批准D121 Gate5独立接入6086941方向；当前仅工程与合成验证，真实新报表读取须取得明确范围授权，不因HTTP长期风险接受而自动扩大Source范围。

## 用户提供的候选信息（尚非实读确认）

报表6086941「面辅料货款申请明细」，候选来源vDom_PayRegister/dbTableId6083578，49业务字段加id；17247条/100样本及公式均只代表用户提供的当次解释。Num、OutStoreNum、bgNum、kpNum保留独立；Price/kpprice、cgGoodsAmount/GoodsAmount、BGAmount/kpamount不混用。当前无可信币种/付款完成证据，不认定银行已付，不增加汇率逻辑，不把100行公式升级为全局规则。

## 最小核验范围

只登录一次并读固定6086941第1页、pageSize100。无Discovery、物料采集、第二页、自动重试或token续期；不猜ExpContractNo/InsideOrderNo过滤语义，不扩大现有Bridge/定时采集catalog，也不接Server页面或数据库。连接复用已批准origin与现有登录/报表请求/分页解析；拒绝重定向与代理，单响应4MiB、子进程有总超时。

原始返回只保存本机新建、ACL保护、Git ignored报告；原始JSON数值文本保留，诊断不计算金额/库存/付款状态。公开回执仅静态字段名、数量、hash、日期及私有报告路径；账号密码/token不得输出、保存、进聊天或Git，凭据文件仅由私密PowerShell进程消费。未知不变0，重复id/同名/数量只作候选，不能当稳定分录身份。

## 验收与后续Gate

合成测试覆盖固定请求范围、分页/身份/元数据不一致、超时/超限、未知与零原值、重复行/重复id保留、金额字段独立、秘密回显拒绝、原始数值文本保真、公共回执不泄露。真实运行前需用户授权此单报表首页范围；报告读取后再核验来源字段、单位/币种、行身份及与合同/采购/出运关系，提出最小正式接线。没有真实读取或财务DB写入授权，不自动合并部署。

更新时机：实际源码/测试、main/PR、读取授权或真实证据变化。GitHub是实时工程事实源，本文件是阶段快照。

## 已完成的合成工程（本地，未远端）

37项Node/实际PowerShell与子进程边界、83项Python、24项既有预检、898项root回归通过；类型、Server与默认Browser构建通过。普通lint发现继承outputs私有生成物16错误3警告，原文件保留；排除outputs的全源码lint零警告通过。CI已接入新Node回归及既有Python套件，Hosted CI未运行。精确源码、发布门禁与冻结证据在最终报告补充，不据本段宣称真实映射通过。

Git交付观察：用户普通PowerShell最新回执仍pushes0；独立API确认B2分支不存在。deliver在push前只以Git ls-remote获取远端证据；GitHub API仅用于push后核验。这解释了本次停止阶段，Git传输失败根因仍未确认。AGENTS保持原样，不重复撞失败通道或伪造原commit交付。

## 2026-10-15 首次真实尝试与错误回执修复

用户明确授权仅一次固定首页核验后，Codex在fc314ce061075d9033cd07bde73fff36dd0fe5f2/clean自行执行私密包装器，使用既有凭据文件；无凭据内容进入工具输出或聊天。执行约5.55秒，返回FAIL / payment_probe_failed / collection / databaseAccess none / sourceActivation not-activated。本次只证明采集未完成；原回执未记录worker阶段及请求计数，不能判断登录成功、报表请求是否发出或失败原因。指定新目录核对JSON报告数量为0。没有自动重试、第二页、数据库、Source激活或部署。

调查发现工程诊断盲区：Python将多数异常统一归类，Node对非零worker丢弃安全错误码，PowerShell进一步只保留通用失败。已补闭合的跨进程错误协议，明确configuration/login/report/validation阶段与0–2 HTTP/0–1报表应用层计数；未知异常/额外字段/秘密文本仍拒绝反射。38项Node/真实包装器、85项Python、类型/Server编译/定向lint通过；旧37/83验收保持原时点历史，不改写已冻结报告。本次未再发起真实网络读取；下一次重试因前次授权仅一次，需要重新确认同一固定范围。
