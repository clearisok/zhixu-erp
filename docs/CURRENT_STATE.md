# 当前恢复点：612目录越出本次610范围，固定复验停止

## 2026-11-05 13:04 最新固定恢复结果

用户批准610目录、原243高频+1月频明细，并明确延长实际恢复后最多70分钟，剩余139登录/11160报表。实际13:03:59开始、截止14:13:59；13:04:03首个双遍目录返回612，新增PI2611-045、PI2611-046，原610身份不变。固定范围保护再次停止，未发布目录、未采明细；本次1登录26报表，保守占用1登录40报表，剩余138/11120。不得自动重置窗口或预算。

新工装已修正类型化范围拒绝和先累计可信指标，metricsUnknown=0；原unknown经recoverSync核对为未发布后记failed，新回执failed/frozen_directory_scope_changed。只读数据库确认visible608/newRuns0/control disabled/version10；原608历史、未选指针保留，queued169/high57，running/unknown0。执行容器和PG停止，旧worker PAUSED，staging未变。首次只读PG检查在启动就绪前返回2；随后等待就绪后核对成功，未增加来源读取。

当前询问用户是否仅允许目录有限新增（既有1000上限，原610身份不得减少/改变，新增不采明细），或仅允许612；截止仍14:13:59及剩余138/11120。答复前不恢复。PR140既有d877三项CI继续复用，不重复测试/上传。见[新证据](../artifacts/five-step-convergence-20261104/content-recovery-612-stop.json)。

此前候选及完整准备记录见[前次接力](tasks/completed/2026-11-05-before-612-scope-stop/CURRENT_STATE.md).

