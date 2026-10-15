# 当前恢复点：合同货款申请侧栏浏览器验收

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。feat/ainuoke-payment-snapshot-storage在b75bc7a9/clean同树继续；未重建/重复PR，旧Source48b/G5c54树与私有证据保持。旧摘要归档completed/2026-10-15-before-payment-read-panel.md。

现有对账tab接只读合同级来源，严禁冒称选中物料匹配/银行实付。model共享50字段并保原顺序，client严格wire v1/有界GET，server只新增evaluatedAt/schemaVersion用于单调时效；0025字节不变。PaymentRequestsReadPanel复用Drawer/表格，精确原值/unknown、10条分页和逐行字段，关闭/切换取消、身份/失败清旧数据、到期隐藏。150客户端/原工具/实际PG(API返回经client严格parse)通过，type/lint通过；修复React render performance.now纯度问题，未放宽lint。

下一步：源码checkpoint→显式Server snapshot完整SHA build→payment-read-panel-ui.integration.test.mjs及原material-display UI，用owned临时PG/Chrome；六宽度/七角色/到期/撤权/迟到响应/截图必须实际验证，再冻结D140/证据/manifest，跑root898/94及最终精确门禁。不能把待跑写成通过。任务ainuoke-payment-read-panel.md；新feature AINUOKE_PAYMENT_REQUESTS.md和UI影响payment-contract-read-panel.json。

新UI不表示真实来源接通；所有真实读次数耗尽，当前无新授权。不得读凭据/上游或真实DB，不启用Source/旧窗口，不触现有演示/宁波18443/18444，不合并部署。NETWORK_DEGRADED不自动恢复推送；最新安全交付命令只在最终新HEAD后生成。
