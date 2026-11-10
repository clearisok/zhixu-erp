# 接力：11月10日晚间目录恢复与合同日期排序

本轮main/部署基线 **dbc61af9be80d0a72e8226afa2cefad6e240ef09**，GitHub API核实。新工作树C:/Users/Administrator/.codex/worktrees/ainuoke-directory-recovery/zhixu-ainuoke-api，branch fix/ainuoke-directory-recovery-sort。从M独立建立，0193358c/98ec1a64仅携入前次文档，产品baseline仍M。旧树及本机数据不改。

## 已执行真实恢复（新代码未部署）

宁波SSH weaveops；ROOT=/home/jackson/weaveops-staging-preview；PROJECT=zhixu-quote-trial-staging-562fbf07；gateway127.0.0.1:3003。M应用/operator/备份/旧owner状态详见[原交接](tasks/completed/2026-11-10-before-evening-recovery/AI_HANDOFF.md)。唯一源owner weaveops-catalog-sync-dbc61af9，RUNTIME=ROOT/runtime/catalog-sync-dbc61af9，SOURCE=ROOT/releases/order-discovery-20261109/source；不得同时启用本机或旧3合同owner。

10:16故障capture b6b6221d-833b-460b-ac48-2a2257bbbaac（catalog-contracts）code catalog_changed_or_over_limit，HTTP200不能证明目录一致；旧差异未保留。最后目录request a435a48a-682e-4537-92da-74b51be44097，09:57:59.775619合同。

新固定只读目录额度已消耗：21:48成功1登录/26报表，620合同；新增7196/PI2611-091，原619身份固定字段不变，另PI2610-170 Brand变化。原证据与新读离线hash/固定字段对照通过。21:57:56.686786正式sync-recovery-preview及expected-preview/hash/reason恢复，resolvedUnknownJobs0/resolvedCatalogRequests0，再原supervisor activate，由正常cron自然执行；不重复清暂停或采目录。

PI2611-091 UUID03d73e50-9c44-4805-9ae2-9bc8c620310d，SO-00000620；21:58:06.759976建档、21:59:46.173成功发布run df660062-b924-4dd1-acb8-5c716516f129，来源21:59:42.901090。22:08:20实际staging HTTP200/合同身份正确/2自购0厂供/匿名401，图片与buildinfo200。该HTTP工具仅正常织序登录和读回，0源请求/0业务写。22:06还有114queued/5running，正常恢复积压；尚未记录清空，不冒称全量完成。

私密证据ROOT/releases/directory-recovery-20261110：attempt.json、directory.private.json、result.private.json、current-directory-review.private.json、recovery-preview.private.json、recovery-result.private.json、activation-result.log、new-order-http.private.json；owner-only，不提交原始业务。固定audit1login/26reports不能再次消耗；后续正常定时源请求使用既有持续服务授权。

## 本地候选与验证

合同日期排序复用镜像contract_date或加工order_date，UI默认desc、null-last、同日单号/UUIDdesc，API未指定排序默认保持旧orderNoasc。数据API集成14/14已过，含日期与建单顺序相反、同日/空日期/分页。新目录增长测试通过，先前fixture6087051缺完整映射造成source_incomplete，改用现有完整6087050合成fixture后单测1/1通过；原同文件其他5项已过，不隐藏失败历史。

候选补充catalog-consistency.ts，完整双遍安全新增只允许原有限重采；旧快照不切换，失败任务和目录回执保留封闭统计，不含原始值。认证、删除、身份/未知字段、范围及不完整传输仍STOP，目录第三次失败仍暂停，合同第三次失败终态可恢复且不继续自动重试。详见当前任务与D192。当前未推送/PR/CI/合并/部署，先完成本地必要验证与最终guard，再集中交付一次；不重跑旧PR143 CI。AGENTS不自动merge main，本次用户未明确批准此新候选合并部署。

浏览器工具能列Chrome标签/claim staging993649966，但DOM/evaluate/CDP均Cannot read properties of undefined (reading timeoutMs)，不可据此冒称浏览器验收。源站Chrome993649962正常用户页不动，不取Cookie/JWT。公网本机curl进程级no-proxy buildinfo200（2.45秒），不改全局代理；服务器入口图片200不等于客户端问题已定位。
