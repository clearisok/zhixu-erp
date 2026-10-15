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

## 2026-10-15 获准一次重试：已到达真实报表，元数据校验阻断

用户明确授权再重试一次后，Codex在244b3d07ab618497874780690682f38d04e80d34/clean自行执行，约6.23秒返回FAIL / payment_probe_invalid_metadata / collection，workerStage validation、httpAttempts 2、reportRequests 1，databaseAccess none、sourceActivation not-activated。依据可执行阶段顺序，登录及6086941基础明细分页解析已通过，卡在原始报表元数据校验；不能声称业务映射正确、当前总条数或完整行数。新目录JSON报告计数仍0。没有追加第三次真实请求，没有第二页/DB/绑定/激活/部署。

代码调查确认诊断器不支持reportObj空白/JSON字符串或cellList空值/JSON字符串的若干表示，构成可复现的兼容缺口；本机未找到可用于还原此次元数据的结构化原始响应，故不冒称已证实真实采用哪一种表示。已做最小表示归一：只解一层合法JSON，空元数据明确缺失，raw UTF8文本原样保留；非对象report/非数组columns、非法JSON、错reportId、编码秘密仍拒绝，新增四个精确静态错误码。公共回执仅增加元数据编码标志，无业务值。40项Node/实际包装器、87项Python、类型、Server编译和定向lint通过；不改数量、金额、单位、正式Adapter、数据库或UI。真实兼容性仍需新授权的固定首页核验，原单次重试授权已用完。

## 2026-10-15 第三次真实尝试与跨语言校验修复

用户新授权最多两次同一固定首页技术核验，首次在537d6711cc3b50c8b680012946055fb2676558e8/clean执行，约6.75秒返回FAIL/payment_probe_invalid_evidence/collection，未返回worker计数或原始响应；本机新目录ainuoke-payment-private-17bc6cd8-b99b-4939-874d-c9e79ebb1f30内JSON文件为0。不能据此确认具体数据形态或业务映射。新授权已使用1次，剩余1次，仅可在本地修复和测试后执行相同首页；无循环或第二页。

发现可复现的工程缺口：Python已接受十进制文本分页整数和缺dataCount时dataList.total的来源协议，Node却用原始值严格比较并允许分页字段缺失，二者不一致。现统一只接受非负安全整数或去空白后的ASCII数字串；不接受空、null、布尔、负数、小数串、指数串、超安全范围；分页必须返回合法值，0仍只代表已知请求分页哨兵。明确分开包结构、时间、hash、响应、行数、总量、分页等静态错误码，不把文本数量改零。

失败证据新增受保护保留通道：仅对固定worker包、4MiB以内、原文hash一致、JSON可解析、深层秘密检查通过的响应保存“rejected”私有诊断报告；不产生来源投影，不宣称映射通过。敏感、hash错误、超限、伪造包和解析不明响应不保留。回执仅静态原因、2HTTP/1report及受保护文件路径/hash；PowerShell独立复查路径、ACL和文件hash。原文仍不入Git。

45项Node/实际私密包装器（含rejected报告写入与ACL全链路）和87项Python通过；typecheck、Server build、定向eslint零警告通过。实际Python合成返回→Node验证覆盖数字串和dataList.total，完全无真实HTTP。无UI/SQL/正式Adapter、数量金额语义或数据库改动。自动审批曾拒绝整文件恢复以防丢失未提交内容；已先保存当前副本并核对diff，仅修复本轮拼接错误，未覆盖他人改动。源码与冻结附录SHA由后续精确工程证据记录。

## 第四次真实尝试与Windows进程编码边界（2026-10-15）

同一“最多两次”授权的第二次在186249f73aa64c9a7970f65b8919af2c9dfeedde/clean执行，约5.58秒仍返回FAIL/payment_probe_invalid_evidence/collection；无worker计数、无业务行回执。本次授权2/2已消耗，已停止真实读取。不能据通用错误码伪造当前报表条数/真实字段映射或单位/金额结论。

本机无网络诊断确认Python管道stdout/stdin编码gbk、preferredEncoding cp936、utf8Mode0。新增真正含未转义中文的假报表，运行实际Python CLI，在强制GBK管道下旧实现被Node UTF8严格解码拒绝（ERR_ENCODING_INVALID_ENCODED_DATA），离线可复现。较早合成响应的中文仅位于已ASCII转义的dataList，未覆盖这一链路。此为已证实的本机工程缺陷，符合最近两次错误发生阶段；因失败原文未保存，不冒称已逐字还原两次真实响应。

最小修复仅将跨进程JSON封套编码改为ASCII转义，Node解码后恢复原始Unicode报表文本，原UTF8原文hash不变；不修改HTTP响应、源字段、原始数值文本或金额计算。另区分worker_encoding与worker_json_invalid静态码，不把传输解码错误混作业务证据错误。

修复后47/47 Node（含实际CLI/GBK中文、私有包装器/ACL/拒绝证据、异常UTF8）、87/87 Python、typecheck、定向lint通过；前一精确源码186249的94/94基线回归与精确main门禁通过。后续最新精确门禁与冻结报告记录实际SHA，不重复宣称真实核验已通过。后续任何真实首页读取需新增明确次数授权；Codex自行执行既有私密工具，不要求用户传密码或重复复制命令。
