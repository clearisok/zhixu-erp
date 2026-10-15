# 6086941 精确只读观察模型：本地工程冻结

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。
Branch：feat/ainuoke-payment-request-read-model；起点33ccad55454568acbba9909109d23cf20bd7139b/clean，原诊断分支及B2/Quote refs保留。同一工作树，不新建树/PR。代码和本文的完整提交由release manifest的recordedAtSha锚定，不使用未来自引用SHA。

## 已确认事实与用户决定

[真实首页](real-first-page-2026-10-15.md)和原私有报告d500982d3b6ba1b2cf408db4e626e4097d93c3570852398e3b911be98cbb80ae保持不变。
[后续两行确认](row-context-confirmation-2026-10-15.md)落实D136：本次申请出运分配与采购数量独立，两个样本个/CNY，金额沿对应采购合同币种。没有全表币种/单位、银行实付或稳定财务分录的确认。

## 已实现

标准JSON解析器在Python内存中保留数字原始文本，重复JSON键拒绝，不经过浮点。Node纯只读Projection保留50字段候选的缺键/null/blank及数值零/负值/非法，四数量及各金额独立。不把Num与OutStoreNum不相等当冲突，不推公式、总额、采购总数或银行付款。

来源观察身份包括报表命名空间、账号指纹、采集时刻、页、原文hash、行序号及完整行内容hash；来源id只作候选。相同id/相同行不归并为金融事件。确认绑定精确观察/行hash/采购合同/证据hash，来源变更不能复用；币种/单位矛盾显示conflict。RMB/人民币只规范为CNY标签，没有兑换功能。

共享静态字段名从原诊断提取，原诊断export兼容；观察模型不再依赖或启动诊断CLI。纯函数不是认证边界，不能接受客户端自报的“已确认”；尚无HTTP接口、财务持久表、Source catalog、SO映射或UI入口解锁。

## 实际验证

- 12/12 Node观察回归，包括真实Python→Node离线子进程、对象/JSON字符串dataList、大整数/长小数/Unicode、零/未知/负值、重复id/重复行、命名空间、来源/行/采购合同变化及单位/币种冲突。
- 96/96 Python全套（原87＋新增9）：JSON数值保真、转义同名重复键、秘密/结构/哈希/范围拒绝、无网络/凭据/DB调用。
- 47/47 原首页诊断Node回归，在共享字段提取后重跑通过。
- typecheck、Server build通过；npm run lint -- --ignore-pattern outputs --max-warnings 0通过。排除的是继承私有生成物，不删除或修改它们；不冒称未排除版本的lint通过。
- 原报告100行离线实证：2行确认CNY/出运单位，98行币种未知，0重复id组/0重复整行组。0HTTP/0DB，原报告不改，新确认/观察先校验ACL再写入原Git忽略目录。[脱敏结果](observations-offline-2026-10-15.json)保留文件hash，不含真实单据/品名/逐行数值。
- 首轮全项目npm test为888/898：10个失败均因新D136尚未提交并前向绑定而报EVIDENCE_WORKTREE_DRIFT，旧冻结决策保护实际生效。先完成新证据checkpoint/线性绑定，再重跑898及94和精确main守卫；在此不预填PASS。后续最终结果另增收口记录。

没有产品UI/样式/交互/SQL/数量/齐套/CCT改动；不需要本阶段新像素验收。继承53个UI影响路径仍按原记录核查，不能把它们称为本阶段新设计。

## 未完成及AI建议

此结果只证明固定首页来源观察，不证明某合同完整对账/当前余额/正式财务分录。下一工程需固定销售合同精确查询及完整分页、稳定明细键/跨时间修正语义、可信采购币种关联，再做持久快照/当前有效SO/fresh权限和已批准侧栏。单位未核实时不从别行或规格猜；金额尚未确认币种不跨行汇总。

所有真实请求次数已用完，未再次读取上游或凭据；没有真实账号/业务DB/绑定/持续激活/部署，四单窗口不重启，不自动合并。Git NETWORK_DEGRADED，未自动恢复；REMOTE PENDING，无本阶段PR/Hosted CI。新代码依赖尚未交付的G5和诊断，不建议将累计分支直接并入main。

本文冻结。后续源码、规则、授权或验证变化新增前向证据，不更新旧hash消除阻断；GitHub是实时工程事实源。

## 本次被测源码文件

- server/ainuoke-source/payment-request-fields.ts：7925af340760d582fba17014980b6ccf0f89406747691cfe9733d887808cfbb8
- server/ainuoke-source/payment-request-observations.ts：d3fd4df7fe7d84f09bb83edd2ce7909c9791b8de1b40ae726e02325ebcbe7787
- tools/ainuoke-bridge/ainuoke_bridge/payment_request_observations.py：38447b8db05256f3c4baba6c24eed56c04e362969594b052ee19b5f462b7ef44
- server/integration/ainuoke-payment-request-observations.test.ts：bf632deac8313dacc2e733edbdc284ce9d28d33b0ce6b91df85c8631f0da9276
- tools/ainuoke-bridge/tests/test_payment_request_observations.py：a9b0bc446492fc9235e50d3dab7a5a8dbf7bcb534f3f0d790e991a688e441f8e
