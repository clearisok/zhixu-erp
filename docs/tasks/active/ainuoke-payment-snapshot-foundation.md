# 6086941完整合同快照底座

核实2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。GitHub为实时事实源，源码/测试/来源身份/授权/阶段变化时更新。本阶段复用无活动进程/容器源码挂载的旧ainuoke-live-readiness树，原bae00845/ref保留；feat/ainuoke-payment-snapshot-foundation从G5联合c54a＋Source48b63101继续。原Source和G5树/HEAD/交付命令不变，未新建worktree或重复PR。

## 已确认事实及本阶段选择

既有首页projectPaymentRequestObservations只允许page1/100，精确币种/单位证据只属于旧两条观察；不能将首页、单行id或字段名升级为完整订单/稳定财务分录。两合同工具已准备，但新真实运行未授权。用户已要求独立6086941只读接入，未授权真实写入/激活。

技术选择D138：先实现纯合同页与快照校验，不等待新增真实读取，也不假称它替代真实过滤核验。旧v1入口及源采集次数不变；新projectPaymentRequestContractPage要求显式v2/真实page，复用原字段投影。buildPaymentContractSnapshot核固定账号、逐行销售合同和id/BillNo/PurContractNo见证，两遍完整正向数据≤200行/2页，行顺序及原字段一致；缺页/混单/重复整页/超限/变化/时效拒绝。保留重复行和未知值、精确金额文本，不作财务事件去重、跨单位求和、币种换算或银行实付推断。

snapshotId绑定账号/合同及两遍页trace，观测行身份绑定实际page与局部rowIndex；时效从最早页10分钟计算，新的尾页不能延长。freshness函数只供内部时效判断，不是发布许可。只证明已交付给模型的受检页一致，不证明上游事务、完整公司范围或查询参数已被真实接受。

## 当前实际验证

104相关Node通过（原首页/观察/两合同79＋新模型25），typecheck、Server编译及增量eslint通过；脚本test:ainuoke-payment-snapshots接入原Source CI。初轮37/38因回放双页先触发时间倒退而非重复capture，改为单页样本隔离该断言，保护不放宽。首轮类型收窄错误已修。源码/报告075a174d、冻结52baddf3之后，完整root898/898、基线94/94、全源码lint及精确main守卫PASS（11页/39能力/53继承UI路径）。本机日志outputs/payment-snapshot-{root,baseline,full-lint,bound-guard}.log；原冻结报告保持不改，后续结果在本任务前向收口。

本轮没有Python、数据库、HTTP路由或UI改动；原114Python只是其原阶段证据，不冒称本轮重跑。所有实际数据为合成，未访问原私有报告/凭据/上游。

## 尚未完成的下一阶段

1. 在一次性库开发不可变存储/发布代际，正式SO/有效归属与Source profile/fresh权限读边界；不允许加工单伪来源或历史别名新发布。6086941不能创建或补造正式SO，未被可信Discovery接纳的合同只能停留诊断；真实接纳仍须另列具体范围取得授权。
2. 经新明确许可运行现有两合同工具，验证真实过滤/分页和固定身份；不得用本纯模型的complete标记替代此Gate。
3. 接原对账侧栏，逐行保留采购/出运/报关/开票数量和独立金额，未知币种/单位不默认。银行实付与汇总/稳定事件键另行验证，不夹带公式或全表推论。

本阶段不声称已完成上述存储/API/侧栏，也不把200行试点边界冒充正式全量容量。Git NETWORK_DEGRADED，不自动恢复交付；真实账号/业务DB、Source绑定/激活/旧四单窗口、宁波18443/18444和部署不操作，不自动合并。

## 最终本地收口

旧Source48b63101、G5c54a及各交付命令/私有报告保持。新分支未安全送达、无新PR/Hosted CI；Git NETWORK_DEGRADED未自动恢复。最终完整HEAD见git log和最终精确守卫。纯模型这一步完成不等于完整Gate5或Goal完成；下一工程优先接隔离存储及只读权限，真实查询/写入/激活仍按各自许可边界。
