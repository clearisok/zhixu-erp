# 6086941 面辅料货款申请明细：有界只读诊断

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；复用erp-followup-governance旧Source工作树，新分支feat/ainuoke-payment-request-probe从已验收68ac1fc9f839ebfc894d39377dac221e7f65566b/clean起。原feat/ainuoke-anomaly-evidence@21da670b619f9ad745b4818ffc0a4eb50b9a501e及全部私有报告保留；另一工作树B2等待用户执行精确交付命令，不修改其分支/HEAD/dirty。没有新建worktree或重复PR。

用户已批准D121 Gate5独立接入6086941方向；当前仅工程与合成验证，真实新报表读取须取得明确范围授权，不因HTTP长期风险接受而自动扩大Source范围。

## 用户提供的候选信息（尚非实读确认）

报表6086941「面辅料货款申请明细」，候选来源vDom_PayRegister/dbTableId6083578，49业务字段加id；17247条/100样本及公式均只代表用户提供的当次解释。Num、OutStoreNum、bgNum、kpNum保留独立；Price/kpprice、cgGoodsAmount/GoodsAmount、BGAmount/kpamount不混用。当前无可信币种/付款完成证据，不认定银行已付，不增加汇率逻辑，不把100行公式升级为全局规则。

## 最小核验范围

只登录一次并读固定6086941第1页、pageSize100。无Discovery、物料采集、第二页、自动重试或token续期；不猜ExpContractNo/InsideOrderNo过滤语义，不扩大现有Bridge/定时采集catalog，也不接Server页面或数据库。连接复用已批准origin与现有登录/报表请求/分页解析；拒绝重定向与代理，单响应4MiB、子进程有总超时。

原始返回只保存本机新建、ACL保护、Git ignored报告；原始JSON数值文本保留，诊断不计算金额/库存/付款状态。公开回执仅静态字段名、数量、hash、日期及私有报告路径；账号密码/token不得输出、保存、进聊天或Git，凭据文件仅由私密PowerShell进程消费。未知不变0，重复id/同名/数量只作候选，不能当稳定分录身份。

## 验收与后续Gate

合成测试覆盖固定请求范围、分页/身份/元数据不一致、超时/超限、未知与零原值、重复行/重复id保留、金额字段独立、秘密回显拒绝、原始数值文本保真、公共回执不泄露。真实运行前需用户授权此单报表首页范围；报告读取后再核验来源字段、单位/币种、行身份及与合同/采购/出运关系，提出最小正式接线。没有真实读取或财务DB写入授权，不自动合并部署。

更新时机：实际源码/测试、main/PR、读取授权或真实证据变化。GitHub是实时工程事实源，本文件是阶段快照。
