# Git上传预算：main562前向预整合

2026-10-30；分支`fix/git-delivery-upload-budget`，原提交`c91d904d8751275dd6a7830893ce237efa021905`与已核实main`562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94`保留为本地合并双亲。开始工作树clean，无容器挂载消费者；沿用既有依赖junction，无新安装。

## 实际范围

原唯一push180秒预算和46行专用回归继续复用；预检/证据仍30秒，无第二次push、认证/证书/祖先/dirty或独立远端核对豁免。实际preflight明确为四个共享文档冲突（CURRENT_STATE、AI_HANDOFF、PROJECT_INDEX、baseline），没有产品冲突。main三份原状态作为历史输入逐字保持，前置短接力区分PR135与实际宁波。main所有evidence及原工具504项旧evidence逐对象保持，未改旧PNG/状态对象。

## 证据与待验收

- 原a859/c91的Git/state79/79、语法/lint、144项旧发布及独立审查保持原日期/源码，见[原证明](../completed/2026-10-28-upload-budget-engineering.md)；本片不冒称重新执行。
- 新本地合并后的五个工具/依赖/测试文件规范Git blob与c91完全相同，回执`outputs/upload-budget-forward-main562/original-tool-byte-proof.json`另保留Windows工作副本hash。首次包装误将CRLF工作副本直接与LF Git原件作字节比较而停止；随后以仓库换行规则核对规范blob相等，没有改动工具文件或重跑合并。这里只证明可复用的纯工具输入不变，不替代本片完整发布门禁。
- 此次尚未重新运行测试、发布守卫/完整基线、浏览器或构建，尚无PR/CI/远端上传。最终main（含待批准PR135与否）确定后集中完成一次必要验收和交付，避免为纯接力状态重复付费CI。
- 本片产品相对main应只有`scripts/git-delivery.mjs`和`scripts/__tests__/git-delivery.test.mjs`，没有业务、SQL、UI、配置、锁文件或调度改动；不合并旧树覆盖main。
- 对原工具父提交做完整cached whitespace检查时，报告了main本来已有的一处历史关账草图尾空格；该路径在本片相对main没有差异，保持原样，不将无关清理混入工具修复。PR实际base562差异检查单独记录，不把前一结果冒称通过。
- 本地双父checkpoint `9c894cf1969732fb6ab62b2d0beee2406715fa10` 已提交，工作树干净；精确双亲为原c91与main562。相对main的差异检查通过。独立只读审查在该HEAD核对五个规范Git blob、599项main evidence、504项工具旧证据、三份main原状态及两文件产品范围，无P1/P2阻断；审查者没有运行测试、联网或操作环境。

当前PR135 a666的三项CI已成功，但merge尚无人类批准；宁波仍main562，固定Source窗口已结束。旧3001/50426、本机三合同、宁波旧3000/3002及全部数据/备份保持。新三分钟预算不是永久网络修复结论，旧代理失败与直连单次成功分开记录。

本地预整合不是完整Gate PASS或可部署候选。限定范围独立复审已完成；后续需最终main守卫与发布回归，再安全交付；merge和部署仍分别具体批准。最后文档提交仅记录这项结果，不改工具字节或冒称当前完整发布验收通过。
