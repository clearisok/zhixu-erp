# 接力：610目录越出固定608范围，等待明确范围决定

2026-11-05；工作树ainuoke-full-catalog-followup/zhixu-ainuoke-api；branch feat/ainuoke-full-catalog-followup。远端/运行候选d8774ba50446d4c894f2c756a363280382afe8b8，main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea。本地后继文档不改变候选；禁止再push文档重复触发CI。PR140仍draft，不自动merge。

D181实现及本地验证完成：目录58不同用例（初次56/57，新测试未来时间错误修正后相关2项及新增稳定重采1项通过），协议/诊断6项，typecheck/相关lint/build、精确守卫通过。最终发布回归182/182，1217221ms。三项CI41958363614、41958363689、41958363742均success。Git首次专用17989代理无监听；进程级GIT_CONFIG覆盖此proxy为空后只读成功，再一次恢复上传精确d877送达；exit1仍记录，未改共享配置或认证。PR说明已同步实际停止结果。

固定窗口：03:21:54.009Z起、04:31:54.009Z止（北京时间11:21:54–12:31:54），最多140登录/11200报表。远端/home/jackson/weaveops-five-step-convergence-20261104/continuous-content-v1；scopeHash110aaa7749a6842f9c7620687b9c555f661005a89d782d5a3320ce9310ca02ef。runner.mjs SHA256 9dfc33b2c1885be47fc0094ebfa839f5792703eb5df6f76d68ff4ce9b113fe5a。唯一reservation已使用，不得重跑execute。首次capture-0.private.json保留，独立验证27条完整诊断、实际1登录26报表。保守预约1登录40报表；old result metricsUnknown1是工装在范围检查后才累计metrics所致，不代表真实请求数不可核对。原始result不可改写。

初始双遍都是610条，原608 sourceId/合同号映射完整保留，新增PI2611-042（7000件，2027-02-04）、PI2611-043（10000件，2027-02-15）。这是范围变化而非D181业务字段变化，故未发布、未采明细。03:21:58.204Z停止，4195ms。scope guard抛普通Error导致目录回执unknown/catalog_result_unknown；只读DB已证实该request无committed run、全窗口0新catalog run，目录仍608。control enabled=false/version8/paused_reason catalog_result_unknown；queued169/high57，running/unknown job0；原608观察及未选成功指针保持，证据表空间/行数未变。PG、执行容器已停，旧worker仍PAUSED。

已通过async询问用户：是否仅允许610目录、明细仍原243高频+原1月频，不采新增两单详情，沿用原截止和剩余额度。答复前不得恢复；到期不得复用旧窗口。若批准，准备新恢复review/reservation，核对未知目录回执的no-publication证据，调用recoverSync（不直接清暂停），完整目录期望改为610身份集合、明细仍原集合。原结果/runner不覆盖。修工装：用SourceError表示范围拒绝；先记已验证metrics再做冻结范围检查；目录身份使用已验证adapter.rows，避免自造归一化。原预算和时钟不得重置。固定两周期判定需同合同两个不同automatic root且started_at实际相隔至少30分钟；手动月频服务验证仍不冒称浏览器点击。

精确镜像目录content-recovery-d8774ba5：最初app文件0055迁移mode600/owner1000在cap-drop容器中EACCES，已只为公开代码增加可读权限。最终operator sha256:db478ff4c5a7bb8edb221d6150585be2f9bd7626cf2a1af181762a484c13c3c4；app sha256:f7898579f4ada8ddbdf9622e7380dfb4bafbd77f5906cce2aae6cf9e016febfd；source均d877，buildId server-preview-d8774ba5-content-recovery，buildTime2026-11-05T02:33:20.629227+00:00。health /api/v1/health及/build-info.json均200、数据库ready、source精确。先前health工装误用/health和/api/build-info返回404已纠正，不是产品路由缺陷。只读root/cap-drop/无公网端口，附件storage disabled。

608接纳演练：remote transfer-rehearsal-d8774ba5，测试PG里新建rehearsal（从restored_after复制），未覆盖旧库。import-catalog608.mjs固定manifest4b584e29a3f1b811a243ec8d78b8c7c06eaa89f4b16f98f616612597b41f3718；实际10来源表608观测、6保护表前后hash同（users/sessions/quotes/attachments/SO/source links），0来源请求，actor映射一致。修过preflight失败与unknown COMMIT区分；当前仅rehearsal通过，尚无live新备份/目标review，不可直接live运行。

原608库/9d236293配对及本机异机恢复、旧staging f21/121表/2报价/3SO/2附件/2用户及旧全部资产均保留。长期站定时备份BACKUP_VERIFIED，但不是本候选临近升级备份。未merge、升级、导入或启用无限调度。后续需连续验收、附件HTTP、新鲜live配对、backup policy重绑。完整旧状态和恢复工具位置见[此前接力](tasks/completed/2026-11-05-before-610-scope-stop/AI_HANDOFF.md)及[本轮证据](../artifacts/five-step-convergence-20261104/content-recovery-scope-stop.json)。
