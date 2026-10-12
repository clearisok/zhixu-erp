# 2026-10-12 release-baseline guard — predecessor snapshots

Historical snapshots from main `4adbc30845f99368caa77d3431cc67a6440ac623`, preserved before state reconciliation. These are dated history, not current PR/runtime status. Relative Markdown links are pinned to the original GitHub commit; content, dates, hashes and limitations otherwise remain unchanged.


## Original docs/CURRENT_STATE.md

[Immutable original](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/CURRENT_STATE.md)

# 当前状态

> 2026-10-12 / A：独立 Git 交付治理分支 `chore/git-delivery-resilience` 已实施安全单次push/独立精确SHA核验、PowerShell脱敏对照及统一NETWORK_DEGRADED规则。定向25/25、lint/语法/解析/diff-check PASS；工具checkpoint ffc7b142cdfd521c1e46123d55dd00ec6b71609c 已正常推送并由GitHub API核实。历史TLS根因仍unresolved，普通用户PowerShell对照待执行；不是ERP/部署变更。[工具与证据](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/git-delivery-resilience.md)。最终流程文档交付以同分支PR及最终SHA为准。

> 2026-10-12 / B：main070d958及已合并PR93/D103已普通merge入PR92，冲突逐hunk解决。原P6/精简订单/只读Control Tower用户人工验收PASS保持；本轮工程回归Source78/78、Material HTTP/负向安全19/19、客户端/SSR25/25、实际Chromium物料7/7(115断言)/商业15/15、npm758/758、完整PG261/261、typecheck/lint/串行Server及双Authority构建/diff-check/清理均PASS。合并a252d82791d3b0cf2a216cc2939a64ec9caf50c7，已验证源码a537e750912eb8c415ce9de5f7403bc120271738正常push；PR92无合并冲突、继续Draft。executionOnly不读写CCT；真实Source/可信账号/团队scope/生产route未激活、不回退Browser。继承Gate1文档30行/hash保持未提交；A/真实环境/数据/migration/真实角色配置未操作。[完整交付与限制](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/order-material-pr93-integration.md) / [本轮截图](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/evidence/order-material-pr93-integration/README.md) / [历史快照](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-12-pr92-pr93-pre-integration-handoff.md)。


> 2026-10-10：PR #91 / D-102 第二轮反馈新版已按用户授权更新隔离18444，**PREVIEW UPDATE PASS / USER ACCEPTANCE PASS（2026-10-11 用户明确批准合并 PR #91）**。实际源码eb9530a/image1707a8e54159；18443、真实业务库/COS和订单工作树未动。

## 当前工程

- 同一可信 receipt/Quote writer/编号/事务/审计；双击防重，挂载/刷新不创建，未知结果只核对原 token。空草稿保留；类型只读，generic PUT不能绕过专用类型切换保护。
- 设置页只保留制作方案管理→新建默认值，复用原ManufacturingPreset及0011；同国多个工厂按明确ID选择，卡片同步默认国家，未选择不伪造参数。通用汇率仍在第一部分；默认变化不回写旧PV。停用/修改默认方案国家时明确清除当前默认组合。
- Server删除全局补充项UI，并停止未来新报价静默继承旧系统费用/工序说明；旧DTO精确金额/DB字段/历史保留，品牌/业务员及单据级能力、Browser旧行为不变。详情两块冗余区移除，保存状态保留在原头部；基础资料失败局部重试，不回退Browser。PV制作方案用横向卡片，保留权限/历史/CAS。
- 首次/主动恢复默认的Server列表铺满实际容器；旧个人v1像素不覆盖，手动拖宽后全部列保持像素，100px及正式缩略图保留。窄屏内部滚动，不改Foundation其他表格。
- 已有列表100px/偏好/正式缩略图、编辑、Revision/PV、Estimate、确认、附件、Excel/ZIP/内部汇总/日志保留。Intake、完整已有报价类型切换、Excel列筛选、整单复制/删除、Revision删除及转订单不在本轮。
- 本轮不新增或修改migration，复用已发布0011；新候选的0001–0011原始checksum兼容验证、非空disposable仅0011升级/重跑/旧数据保持PASS。正常启动verify-only。订单PR92文件交集为零，未操作其工作树。

## 验证与交付

源码eb9530a工程阶段实际完整Chromium78/78、列表/图片专项27/27、创建29/29、资料14/14、Revision/PV10/10、Estimate8/8、附件/资料迁移11/11、auth/frontend86/86、SSR9/9、npm679/679；typecheck/lint/Server及两种前端PASS，默认build-info browser/browser/writable/session。部署收口未重复上述工程测试/构建。40张合成截图见[工程索引](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/evidence/quote-pr91-second-acceptance/README.md)；本次另行实际执行备份/完整隔离恢复、运行身份/对象SHA和全新只读Chromium，结果PASS，见[部署证据](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/quote-two-step-creation.md#second-acceptance-preview-deployment-pass-2026-10-10)。

原分支 `feat/quote-two-step-creation`；工程从f2d7886继续，本次授权部署从local/remote/PR91 676035b / clean继续，main84c8c5b。工程checkpoint eb9530ac9a2e1b7f68299d97c4d424662a6622f7；与订单PR92文件交集为零，未访问其工作树。此前网络故障/STOP/部署证据保留，不改写成当前工程结果。

Linux候选 `zhixu-quote-two-step:eb9530ac9a2e-ux-20261010t141559z` / image1707a8e54159 **已部署18444**，HTTPS/编译/labels一致，server/server/writable/session。最终文档SHA不冒充镜像源码；[构建时完整身份](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/evidence/quote-pr91-second-acceptance/candidate.json)中的NOT DEPLOYED为当时历史状态。

## 环境与下一步

**18444当前运行eb9530a/1707a8e54159，0001–0011 current；本次未执行迁移。** 新备份 `pr91-second-2026-10-10T15-26-38-395Z`及完整隔离PG/对象/配置恢复PASS。暂停前无上传/创建/写事务，最终30报价/30Revision/PV、2账号、3附件/对象、3回执/67日志及所有业务表哈希保持；database/对象容器、卷/网络/TLS不变，仅app/gateway及白名单构建身份更新。历史28条备份仍保留但不充当本次恢复依据。

用户可继续使用[18444](https://localhost:18444/quote-center)；2026-10-11 用户已正式确认 PR #91 人工验收通过并授权合并。新隔离profile实测默认列表铺满、100px×8组合、拖宽不挤邻列、六种桌面/移动布局、详情去冗余和方案卡片PASS；既有手机大图原件7770409字节，列表实际下载256×192/4767字节缩略数据。现库0制作方案/0全局设置，诚实空态而非自动Seed。未创建报价或保存设置；单次正常登录/注销仅新增1 session/1登录记录。此前部署/STOP证据保留；汇率日期政策、影响预览与批量更新属于后续独立任务，PR #91 的验收与合并不代表该功能已实现。此次授权不涉及新的数据库/环境更新。

[历史部署接力](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-10-pr91-two-step-handoff-history.md)和[旧项目证据](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-10-pre-two-step-state-history.md)保留，旧“取消零创建”不再是当前普通电脑规则；工程PASS不是人工PASS。

D-096历史导入NOT REQUIRED；D-097无Browser业务回退、D-098 Quote-first、D-099原版视觉与Server能力底线、D-101剩余业务目标保持。默认Browser不变；新Server能力与真实部署分别记录。


## Original docs/AI_HANDOFF.md

[Immutable original](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/AI_HANDOFF.md)

# AI handoff

## 当前 — Git delivery resilience（2026-10-12）

独立分支 `chore/git-delivery-resilience`，clean A 基线 bfa987c，从实际已 fetch/核实 main70ff95e 新建。只改开发交付工具/测试/流程，未操作 ERP/其他工作树/任何运行环境。进程级脱敏诊断、默认Dry Run的单次安全push与独立GitHub API精确SHA核验、AGENTS统一NETWORK_DEGRADED规则已实施；未知dirty/认证/分歧/证书身份错误STOP，已知dirty须完整SHA256保护。最终工具定向25/25（无skip）、lint零警告/语法/解析/diff-check及实际PowerShell诊断PASS；三种只读HTTPS对照均成功，历史TLS根因仍unresolved，普通用户PowerShell对照待执行。工具checkpoint ffc7b142cdfd521c1e46123d55dd00ec6b71609c 通过实际PowerShell入口push一次，GitHub API独立核实DELIVERED_VERIFIED；最终文档SHA/唯一PR见交付消息，不循环写自身SHA。完整事实/用法见[任务证据](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/git-delivery-resilience.md)。下一步只待流程审查及用户一次脱敏对照；下方既有工程证据保持。

## 保留恢复点 — PR92 整合已合并 PR93（2026-10-12）

最新main070d958008709d06636ba329a3bba0d14e4a023b，PR93已MERGED；D103四键、CCT字段投影/部分PATCH与Quote成本/销售价/历史/导出/日志保护保持。PR92原P6/精简详情/Control Tower用户人工验收已PASS，仍Draft。普通merge a252d82791d3b0cf2a216cc2939a64ec9caf50c7与负向审计5a603b60e09ab80547a69e63e3e85e180f0cc6c2已推送；本轮Source78/78、Material HTTP/安全19/19、客户端/SSR25/25、实际Chromium闭环7/7(115断言)/商业15/15、npm758/758、完整PG261/261、typecheck/lint/串行Server和双Authority构建/diff-check/清理PASS；源码a537e750912eb8c415ce9de5f7403bc120271738已正常push，最终文档checkpoint三方HEAD见PR及交付消息。executionOnly不读写CCT，Source capability/生产route默认未开放，不回退Browser。

起始B local/origin/PR92 03b1078e99ff44ceb875dd0b01a1e22358f4dab6；Gate0/普通merge/负向测试/联合UI各checkpoint已正常push；交付前fetch main仍070d958，0 behind，PR92 mergeable=true且保持Draft。唯一继承dirty为Gate1文档30行，SHA2568B24F58EB42F2141778F1EBE69138C64449BE04F522757CBC50325FB5286E21E，严禁stage/覆盖。当前Gate/test/remote记录见[本轮接力](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/order-material-pr93-integration.md)。旧B/Main恢复点的日期/hash/测试/网络结论保留在[合并前快照](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-12-pr92-pr93-pre-integration-handoff.md)、[P6修复报告](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/order-material-p6-restoration.md)与[PR93安全报告](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/commercial-amount-read-security.md)，不改写历史。

本轮不操作A、18443/18444、真实数据库/艾诺科/COS/凭据、migration或角色；团队范围/账号绑定/角色管理与生产激活仍待独立Gate。PR91真实部署证据如下保留，不是本轮部署。

## Historical recovery — PR91 accepted and MERGED


- Original worktree `D:/workspace/zhixu-quote-two-step`, branch `feat/quote-two-step-creation`; authorized deployment resumed clean local/remote/PR91 `676035bd1a0323e928383b340f1cbfec9e0572eb`, main `84c8c5b520dbcb956ae27a24103e6607a1c227c3`. No merge or other worktree changes.
- **PREVIEW UPDATE PASS / USER ACCEPTANCE PASS**. User explicitly confirmed human acceptance and authorized PR #91 GitHub merge on 2026-10-11; no FX-policy feature or environment update is covered by that acceptance. Only `zhixu-preview-d099-18444` / `quote_preview` updated; [entry](https://localhost:18444/quote-center). Actual HTTPS/labels/compiled identity: source **eb9530ac9a2e1b7f68299d97c4d424662a6622f7**, image **sha256:1707a8e54159928330b4d223f5db4646a6d4696e3684e9615055fb9bd9c33e23**, immutable tag `zhixu-quote-two-step:eb9530ac9a2e-ux-20261010t141559z`, server/server/writable/session. Later documentation SHA is not image source.
- User pause, zero pending uploads/creations/open writer transactions and quiet data window verified. New backup `pr91-second-2026-10-10T15-26-38-395Z`, manifest SHA **1842656af1c39cbbb3a0fb69aef5387f7f24512f41831641b50e9d6848d35620**; actual independent PG/object/config restore **FULL RESTORE PASS**, owned drill cleanup PASS. All0001–0011 current/exact; **no migration executed**. Only app/gateway and whitelisted build identity replaced; database/object services, volumes/network/TLS preserved, exact reviewed path aliases and full mount/bind hashes PASS.
- Final preservation: **30 Quotes/30 Revisions/30 PVs,2 accounts,3 attachments/relations/objects,3 receipts,67 operation logs** unchanged; every business table hash and original object size/SHA match frozen backup. Normal single login/logout only added1 session/1 login-attempt record; role permissions unchanged. Global settings/schemes remain empty: no seed, Quote creation or settings save.
- Actual new readonly Chromium PASS: five default-table pixel checks (including1536 CSS/DPR1.25),100px ×8 desktop/view combinations, drag neighbours unchanged, six detail/settings/modal/mobile sizes, protected256×192/4767-byte thumbnail for existing4032×3024/7770409-byte original, no page overflow/browser exceptions/business writes.29 protected screenshots remain local, not uploaded. [Current deployment evidence](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/quote-two-step-creation.md#second-acceptance-preview-deployment-pass-2026-10-10).
- Prior source-bound engineering Chromium78/78/npm679/679 and other quality results remain in [engineering evidence](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/quote-two-step-creation.md#second-user-acceptance-revision-2026-10-10) / [40 synthetic screenshots](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/evidence/quote-pr91-second-acceptance/README.md); not rerun for deployment/docs. Earlier STOP/backup/network history retained in [archive](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-10-pr91-two-step-handoff-history.md).
- Current GitHub verification: PR #91 is MERGED into main fcf36e5eab6c78254f808c1cba38f3a63a66d4f8. Date-effective FX policy work remains separate and needs its own task authorization; PR #92 stays an independent Draft. 18444 runtime remains the verified immutable candidate; merging alone does not authorize another deployment. 18443/real business DB/COS/old environments/PR92 untouched. Raw backups/config/credentials/Preview captures stay outside Git.


## Original docs/PROJECT_INDEX.md

[Immutable original](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/PROJECT_INDEX.md)

# 项目知识索引

> 2026-10-12 开发流程：[Git 单次安全交付、脱敏对照与 NETWORK_DEGRADED 协议](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/git-delivery-resilience.md)。工具/临时仓库25/25验证，历史TLS根因未确定；不改变业务规则，不涉及运行环境。

> 2026-10-12：[PR93](https://github.com/clearisok/zhixu-erp/pull/93) 已合并至 main **070d958008709d06636ba329a3bba0d14e4a023b**，D-103 四键及测算销售价边界已实施。PR92 保持 Draft，P6/精简详情/只读 Control Tower 用户人工验收已 PASS；B已普通merge并完成联合工程回归：npm758/758、完整PG261/261、物料Chromium7/7/115断言与商业15/15、双Authority构建PASS，无合并冲突，未操作真实环境。当前证据见 [B 整合报告](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/order-material-pr93-integration.md)，PR93 原隔离证据见 [商业安全报告](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/commercial-amount-read-security.md)，合并前状态快照见 [历史接力](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-12-pr92-pr93-pre-integration-handoff.md)。

> 2026-10-11：用户已明确确认 PR #91 人工验收 PASS 并授权 GitHub 合并；最终 GitHub 合并状态以 PR #91 为准。18444 保持已验收候选，合并不授权重新部署、迁移或操作 18443/COS。日期汇率政策、影响清单与受控批量应用属下一独立功能，应在 #91 合并后从最新 main 开发；订单 PR #92 继续独立 Draft。下述早期 USER ACCEPTANCE PENDING 为当时历史记录。

> 2026-10-10 PR91第二轮反馈：制作方案→默认值两区、卡片选择、详情去冗余和列表铺满已授权更新18444；实际源码eb9530a/image1707a8e54159，**PREVIEW UPDATE PASS / USER ACCEPTANCE PENDING**。本次新备份/完整隔离恢复、30报价及3对象保持、只读Chromium PASS，未执行迁移/创建报价/保存设置。见[当前部署证据](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/quote-two-step-creation.md#second-acceptance-preview-deployment-pass-2026-10-10)、[工程测试](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/quote-two-step-creation.md#second-user-acceptance-revision-2026-10-10)、[合成截图索引](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/evidence/quote-pr91-second-acceptance/README.md)。下面b7c2080等为此前历史；18443/真实业务库/COS/订单工作树未动，不自动合并。

> 2026-10-10 D-102：默认设置/直接新建已实施，18444运行0011及b7c2080候选。两处精确挂载/identity、授权有界HTTPS重试、实际隔离Chromium及最终旧数据/对象SHA验收PASS，**PREVIEW UPDATE PASS / USER ACCEPTANCE PENDING**。见[本次验收](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/quote-two-step-creation.md#remaining-read-only-deployment-acceptance-pass-2026-10-10)、[领域契约](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/features/QUOTE_INTAKE.md)；此前STOP/恢复证据保留。D-101其余目标保持；Intake/手机/转换及已有类型切换 **NOT IMPLEMENTED**。18443/订单工作树未动，不自动合并。

> PR #89 D-099 列表/100px/受保护Server缩略图已合并；原工程、18444更新和人工验收历史见[宽度/图片契约、测试与Preview备份恢复](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/d099-list-acceptance.md)，[合成像素证据](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/assets/d099-list-acceptance/README.md)。普通手机大图已通过工程验证，不再是原图大小占位路径。本轮未复核环境或新增人工验收结论，18443及旧环境不操作。

> 当前：D-099 Quote 原版 UI / Server 工程已由 PR #86 合并，人工 UI 验收 PENDING；PR #85 Source/Bridge 修复也已合并。PR #84 已 MERGED 于 `49a82c9f970e158ded589300b4aa04fc4c809038`；原 Windows 更新有[备份/运行身份/持久数据验收证据](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-09-windows-quote-trial-ui-update.md)，合并不代表新的运行更新。PR #88 D-099 新候选准备不等于已部署。当前摘要见 CURRENT_STATE，恢复点见 AI_HANDOFF；[UI审计](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/active/quote-original-ui-convergence.md)、[合成视觉索引](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/assets/quote-original-convergence/README.md)、[部署历史归档](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-09-windows-trial-delivery-history.md)与[操作说明](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/ops/quote-trial/README.md)均保留。本轮不复核或更新真实环境，不重新 setup/init。
> PR #87 已合并至 `7ed9204d552384730bf93c992b500c530d639c38`；[历史补测、合成 API 演示与0009发布风险](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/tasks/completed/2026-10-10-pr87-delivery-plan-integration.md)保留。真实业务环境0009未获本轮授权，只有隔离18444 Preview通过安全检查后可以前向迁移。

> D-097 工程阶段历史：Fresh Start **正式 Quote Server 基本闭环工程/隔离验收完成，当时未真实部署**；本次 win01 已部署事实见上方及 CURRENT_STATE。显式 Quote authority=server（默认 browser）接原地 list/new/detail、正式 Editor/附件；全局 Browser bootstrap/mock identity 与未支持 URL 隔离。支持/未接动作、实际 Chromium 与质量证据见 `features/FRESH_START_FOUNDATION.md`、CURRENT_STATE/AI_HANDOFF。旧 runtime 与旧数据不变，历史导入 NOT REQUIRED。

> **当前新系统上线方向：D-096，全部业务数据从空开始。** 旧环境保留，Q5 historical import NOT REQUIRED；功能/安全/Quote-first 顺序不变，不代表正式 UI 已全接 Server。空库验证、技术初始化白名单、隔离部署说明与剩余接线文件见 [Fresh Start Foundation](https://github.com/clearisok/zhixu-erp/blob/4adbc30845f99368caa77d3431cc67a6440ac623/docs/features/FRESH_START_FOUNDATION.md)。下面既有部署/数据数量只描述旧环境，不是新系统的数据源或初始化指令。COS real Node preflight 已 PASS（PR #73 用户证据），不是 runtime storage activation。

> 最后确认的旧开发运行态（本轮未复核，非新候选）：Q3B2I-C2 CLOSED / PASS。PR #64 的 Local Single-User UI 修复已部署至真实本机 `127.0.0.1:3001` 并经用户真实浏览器验收；Q3 master/settings 为 Server authority 且编辑已重开，旧 3002 最后确认停止，旧 Quote aggregate 与附件仍由 Browser 持有。真实 0008/对象存储未激活；D-093 Active、B3/B3-R 已被取代。这不是新 session 试用候选的部署或登录指引。见 CURRENT_STATE 与 Q3B2I_CUTOVER_RUNBOOK 的历史执行证据。
