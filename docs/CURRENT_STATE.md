# 当前状态：PR131验收修复与艾诺科闭环发布准备

2026-10-28；分支feat/closing-support-interfaces。本片从干净c9b87c3ca48de5104f3de4158ce0f434cd3a2d52开始，main仍核实为6479a713e2b80228f008049519ebbd50d10601a8；最终本地HEAD从Git核对。[原状态/入口/接力全文及hash](tasks/completed/2026-10-28-pr131-ci-source-readiness/input-state.json)完整保留，不覆盖旧网络、失败和阶段结果。

**远端**：c9已经进程级Git直连一次上传成功（4337ms/exit0/独立API完整SHA），唯一[PR131](https://github.com/clearisok/zhixu-erp/pull/131)仍open/draft、未合并。Hosted Release成功，source旧工价测试调用退役手工关账失败，team旧登录测试仍期待关账未开放失败；没有手工重跑。旧代理17989不监听、7897 CONNECT后TLS中断，本次仅进程级直连成功；未改全局代理/认证/TLS，不宣称永久恢复。本片修复交付及新CI以精确远端/PR另核，不能借Release替代其他检查。

**本片修复**：仅两份测试改用月份计划→明确调月→财务采用，并按snapshot门控验证匿名关账重定向/401。旧45样本不回填，新的加工单验证CNY阻断、USD零价和批次不变；锁定正控强制两色各50/共100及两条非空快照，再逐行比较。没有产品、SQL、UI、公式、权限或来源范围变化。类型/相关lint、早期工价78项及补强后受影响20项、实际Chromium登录11项分源通过；中间字段错误和原Hosted失败保留。见[本片证明](tasks/completed/2026-10-28-pr131-ci-source-readiness.md)。

**工程/运行**：产品仍a198d1829675092006708727624ee867be0e7b60；原18项Chromium/811项目/182发布与SQL分源结果见[最终工程](tasks/completed/2026-10-28-closing-support-final-validation.md)。c9完整发布182/182、1007239.7607ms实际通过，后续guard/manifest未改，复用而不重复整套。a198镜像90e完整非空恢复9/9、新65139空候选五healthy及111表0见[持久证明](tasks/completed/2026-10-28-closing-support-persistent-runtime.md)。50426工具已实现但未实际切换；旧3001/50426、演示52251、库/卷/备份/工作树及他人dirty保护。

**宁波新观察**：既有SSH别名、严格主机校验只读；四旧服务健康。公网staging.weaveops.top/build-info当前200，与宁波127.0.0.1:3002均为7cd43b6142800bb61827410395c4a2d7a9856bc5；旧staging无当前附件storage/Source配置。只证明旧入口可达，不是新版本或真实闭环。无DB查询、凭据读取、安装、容器启停或配置变更。

**下一步**：按[闭环发布清单](tasks/active/ningbo-server-closed-loop-readiness-2026-10-28.md)，集中交付当前修复、必要CI/独立复审，再申请精确合并；冻结main Linux镜像及独立持久目标。物料scheduler仅刷新已绑定四流，主信息/颜色、6086941和6086979独立；空/合成证明不能替代精确候选真实首绑、有限续刷与人工核对。D105真实四流前置保持；新来源额度/启用、合并、宁波部署和退役各自明确批准。用户要求就绪时提醒，提醒不执行部署。完整[Gate0目标](tasks/active/server-convergence-gate0-2026-10-20.md)不缩减、不标完成。

同批后继本地检查：normalization旧升级夹具漏隐藏0049从属link，产品正确拒绝；仅补负控/完整旧schema正控，42/42及相关lint通过，不恢复公开归一。其他Hosted未到达命令继续按实际结果验收，集中一次交付。
