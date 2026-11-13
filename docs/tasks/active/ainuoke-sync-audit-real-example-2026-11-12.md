# 真实历史同步例子与证据边界

本轮仅通过SSH执行`BEGIN READ ONLY`查询宁波已有记录，未登录艾诺科、未发报表、未手动刷新、未改staging业务数据/控制。以下是11月11日的真实历史任务，不冒充本轮新采集或已写入0058的新台账。

| 项目 | 真实值（北京时间） |
|---|---|
|目录请求/批次原始ID|b9156598-a466-4c16-bbb2-1e0d67c6f20d|
|正式目录run|46e8571a-6f2c-4674-b2c2-dcce78eb780e|
|源报表|6086103 销售合同|
|任务开始|2026-11-11 15:37:41.989732|
|第一次完整目录|13页、620行；首/末页完成15:37:42.103634 / 15:37:43.531974|
|第二次完整目录|13页、620行；首/末页完成15:37:43.644904 / 15:37:45.184749|
|本次实际读取|1240行（两遍）；620个销售合同，不把1240当新订单数|
|来源获取完成|最后一页完成15:37:45.184749；旧版本未保存逐请求开始时刻|
|目录run行记录时间|15:37:45.385358（表默认now()，不是精确COMMIT时间）|
|任务完成|15:37:45.566850，状态complete，引用上述真实run|
|API/报表/登录|26 / 26 / 0；authRenewals=0，networkRetries=0|
|源数据自身更新时间|不可获取，不从采集时间推算|
|真实提交确认精确时刻|旧版本未记录，不可获取，不填成任务结束/行记录时刻|
|新增/更新/未变化明细数|旧版本未记录，不猜测；620是本次目录内容规模|

证据：`ainuoke_catalog_requests`由source_key和request_id精确关联`ainuoke_catalog_runs`，q.result.metrics明确26/26/0，q.result.runId与真实run一致；run.capture_evidence_id关联`ainuoke_catalog_capture_evidence`，directory.discoveryBefore/After的每页rowsHash精确关联`ainuoke_catalog_evidence_chunks`。逐页`jsonb_array_length(rows)`求和得到各620，不按total字段或顶部合计猜测。未输出账号、fingerprint、原始行、Cookie或Token。

只读核对核心SQL（完整查询在当轮工具回执，以下为审计关联逻辑）：

```sql
BEGIN READ ONLY;
SELECT q.request_id,q.created_at,q.finished_at,q.status,q.result->'metrics',r.id,r.captured_at,r.created_at
FROM ainuoke_catalog_requests q JOIN ainuoke_catalog_runs r
 ON r.source_key=q.source_key AND r.request_id=q.request_id
WHERE q.source_key='local-empty' AND q.request_id='b9156598-a466-4c16-bbb2-1e0d67c6f20d';
-- 按run.capture_evidence_id取directory两遍页，逐页rowsHash关联chunks并统计实际JSON数组长度。
COMMIT;
```

## 后续失败及根因

原capture `7d0169d0-e8cd-410d-b93e-5ee4262bbea6`，15:52:23.933–15:52:34.391，54请求全complete，6086103的1–13页各两次。五个任务回执均为beforeRows=621、afterRows=621、added=0、removed=0、identityChanges=0、scopeChanged=false、changedFields=[hsid]。旧复合码catalog_changed_or_over_limit让来源进入无退避的全局暂停。此证据不证明密码/会话/网络/超限，也不解释hsid的业务含义。

候选只允许沿用完整身份/范围/页校验重新取得稳定两遍；不接受正在变化的结果。新0058会在原业务事务中写审计关联，COMMIT确认之后记提交确认时间，失联保持未知；管理员/认证/身份保护不自动解除。工程验证详任务记录。真实库尚未迁移0058，历史台账补录尚未执行，staging暂停仍保留。
