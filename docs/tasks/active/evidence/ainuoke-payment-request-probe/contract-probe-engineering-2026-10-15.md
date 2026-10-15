# 两合同分页诊断：合成工程冻结结果

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。分支feat/ainuoke-payment-contract-probe；起点fbb6002f6b8fc0257bca72c3bd4e4ae07488f0a7/clean，同一Source树。本文与源码以release manifest的recordedAtSha冻结；后续变化新增证据。GitHub为实时工程事实源。

## 实现与确认边界

D137新增显式两合同模式，原D135首页仍固定2HTTP/1report。来源、凭据、report和QueryBuilder复用：6086941/ExpContractNo/is是待真实核验的过滤候选，不把字段名或合成测试升级为上游过滤已生效。

私有人工确认文件的精确hash/来源账号/两份不同销售合同及申请单、采购合同、id见证共同固定选择；不能从款号或数量猜身份。最多2页/合同、100行/页，两份合同完整读取两遍，最多8报表/9HTTP，4MiB单响应、16MiB累计报表原文（超限探测额外1字节）、180秒worker/195秒终端，无自动重试/Discovery/catalog/DB/激活。

拒绝混单、缺页、空而未验证、重复整页、缺见证和两遍内容变化；合法重复行保留，数量/金额原始文本独立，不去重求和或认定银行付款。安全失败页可隔离保存，包括无rows/metadata的API错误；非法JSON/秘密回显/超限原文不保留。返回闭合代码/阶段/实际应用层请求计数，不输出错误原文。

Node进程退出状态与结果必须一致，超时终止，精确JSON源文本能力不足时不把凭据送入采集worker。PowerShell两个动作互斥，样本文件元数据在凭据读取前核实，匿名stdin传配置；raw只在ACL保护/Git忽略新文件。Windows ADMINI~1/Administrator误判已用native物理路径修复，原私有文件不改。

## 实际验证

- 79/79相关Node：47原首页、13观察、19本阶段。覆盖真正Python→Node GBK管道、长JSON数值、两合同两遍、101行两页、混单/忽略过滤、缺页/重复/变更、空/超限/缺见证、哈希/时间/秘密拒绝、进程退出/超时，以及实际Windows私有终端/ACL/收据。
- 114/114 Python全套：新增18项两合同规则及剩余字节预算和安全错误隔离，原96项保持通过。
- typecheck、Server build、全源码lint（明确排除继承outputs私有生成物）通过；没有删除私有生成物来消除lint。
- 原私有确认SHA212481539bf342aef5899658199bf20d95e76331a3c3d32983a1a0e768c60e02由新加载器离线核实：2目标S1/S2，selectionHash66d318aee2d8377bada020461c6ef97918972c7aca0e29a88483a7b74ac253c0；0HTTP/0DB，未访问凭据。
- 本阶段898项目、94基线和精确main守卫在D137前向证据绑定后执行；此处不预填PASS，不将父分支fbb的历史结果冒充本提交新结果。

无产品UI/API/SQL/正式快照写入/真实账号或数据操作，原53个UI影响路径保持其原审批/冻结。没有新截图、Source激活、财务人工验收或宁波/18443/18444部署，不自动合并。

## 剩余工作与下一次许可

真实次数均已用完，新ReadContracts从未执行。下一次只请求这两份已核实样本合同一次有界运行的明确授权，范围及预算见[任务](../../ainuoke-payment-contract-probe.md)。如果上游拒绝或忽略过滤，保留安全私有证据并停止，不改查询范围自我重试。

通过后才做整代快照/有效SO/fresh权限/现有侧栏的独立交付；目前仍mappingVerified=false。跨时间分录去重和金额汇总、银行实付语义另设Gate。理论/实际采购、D136的三金额币种限定、单位未知、已有订单/流水/商业历史都不变。

Git NETWORK_DEGRADED，未自动恢复/重复push；新branch未精确远端核实，尚无本Phase PR/Hosted CI。原父branch和所有工作树/私有报告保留。

## 被测文件LF SHA256

- server/ainuoke-source/payment-request-contract-probe.ts：bb1916a7160eae5e81c03d7fa31a2b5661fe96d4c4f81ce6acec8abdcc188a63
- tools/ainuoke-bridge/ainuoke_bridge/payment_request_contract_probe.py：9ec6df389f199d5f5d3f8aee80656479bbd5c497c3059a4623f0e98a3837bb70
- tools/ainuoke-bridge/ainuoke_bridge/payment_request_probe.py：6d626969bbe61b755b199256e24e03ca50686a1ea57e392e0b32ac5bdad80bcc
- scripts/ainuoke-payment-request-probe.ps1：a99f7cdc342b159ac7fbfff30f691ce8509cede633e1d4a0f69dd0da470012c4
- server/integration/ainuoke-payment-request-contract-probe.test.ts：0b5a0cc9e12d14cccad4460acb8e416bf07eb977de54f4708996c981845c794f
- tools/ainuoke-bridge/tests/test_payment_request_contract_probe.py：fcb3e98978f8996a205c49f7dcd78fea8a79859332414b03e2c78306d57c01e0
