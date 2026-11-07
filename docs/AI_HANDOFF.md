# 接力：本机617单完整验收完成

2026-11-07 11:06 北京时间。实际工作树 C:/Users/Administrator/.codex/worktrees/ainuoke-it-material-details/zhixu-ainuoke-api；分支 fix/ainuoke-order-material-closure；业务运行版本 ddd7d93499e2c8852115d9647351f7c1f2e9506b。先读CURRENT_STATE和tasks/active/ainuoke-final-supply-rules-2026-11-07.md。

本机63051应用PID46732；按需worker PID6456，固定617 sourceIds、automatic=false，只消费已有/用户手动请求，不自动目录查询或周期排队。全量PID32128已正常结束，不能重跑closure-all。原tmpfs数据库容器禁止停止/删除；禁止运行real-demo.ts初始化。原只读账号不变；当前页面使用有限刷新操作账号。

私密根 D:/WeaveOps-Previews/real-orders-20261106。final-rules-20261107/reconciliation.private.json 是最终617真实HTTP/head/合同清单：613有物料、4完整空、0历史待完成/失败/待处理。原144保持原run且0重采，473新增成功。source范围与原回执在closure-all/scope.private.json和receipts.json；旧stopped.json是历史失败，不是当前状态。完整执行结束于11:00:59。

实际2登录/15166报表/0续期，474attempt含1次可恢复超时。recovered-failures.private.json记录PI2606-109/6086875第1页21秒超时→第2任务成功；不要抹掉旧回执。sample-http-evidence.private.json包含5样本HTTP/快照/来源核对与只读403；真实点击request08d67af8-0b63-4a60-a028-3a74fd3e30e0、PI2610-189发布eb9952db-c836-46f2-88d5-20a1c1897bdc。

最新 verified-pair-1794020559967：134587075字节dump，SHA256 43d39ad67198ff5710a79baafd428006628aec78d6b70421ffffd61883864296，2附件；异库恢复617订单/617head/1664快照/0queued/2附件一致。manual-data-final.private.json是54表最终哈希保护证明；original-144-preservation.private.json证明旧成功未重采。不要公开/提交runtime、凭据、原始来源或备份。

日常：现有订单页有限操作账号点“刷新来源”→正式sync-order排队→按需worker采集发布→自动读回。只读账号只能刷新页面。若本机进程停止，先核对运行身份和库；resume-real.ts只恢复应用，local-manual-worker.ts只调用正式runSyncTick/createSessionCollector；有enabled冲突/running/unknown/paused时不能盲启，先用正式sync-recovery-preview和回执核对。POSIX正常部署CLI支持sync-run --source-ids；Windows包装器不另建认证/发布系统。保持原库、ID、任务/请求UUID和历史时间，不重置617。

D187取代旧厂供替代猜测；客供/海外代购按原文保留且不计自购。需求单位缺失与45条供料方式缺失保持未知，不代表采集没完成。原始时间较旧仍标历史，不能计为刚刷新。

继承清单基线 cb5cc29baa49ed7115fdb6c9506b6a80356936ea；本轮没有远端交付、merge、staging部署或CI。原认证额度范围仍未证实。历史接力保留在tasks/completed/2026-11-07-before-final-supply-recovery/。
