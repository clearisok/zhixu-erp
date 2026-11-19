# 当前接力：6086103可变字段有界重采

2026-11-19，Refs Issue157。分支fix/catalog-mutable-recapture；main基线1ab40fd39b035e471f5557903c026dd36d3bab8e，clean起点。用户仅批准实现、隔离测试和PR；不得部署/合并/改真实Staging暂停或数据。

Gate1接入Price分类、真实SDK定向页读、全新完整双遍、持久队列1/5分钟三次总采集、0059差异诊断。30/30相关单元/真实合成SDK测试、根typecheck及server build通过。还未完成隔离PG完整流转和最终回归，不能宣布修复验收完成。

Gate2已补隔离Docker/PostgreSQL四项完整流转并通过：保留旧成功→重试→定向页→全新完整发布；独立合同新证据发布；三次不稳阻断；目录入口同样重采；诊断存储失败保留主错。首次测试固定时钟早于新采集被正确拒绝，修正测试时钟后4/4通过。Python完整210/210、IPC补充8/8、lint通过；新单次worker也复用现有NDJSON进度协议，超时前已读证据可持久保存。已接入既有CI脚本，完整目录回归/根npm test/基线/前后端build正在继续；本轮不操作真实环境。

继续任务、依赖/预算/历史证据限制及受控恢复设计见 docs/tasks/active/catalog-mutable-recapture-2026-11-19.md。此前UI接力完整保留于 docs/tasks/completed/2026-11-19-before-catalog-recapture/AI_HANDOFF.md。当前Staging仍按既有来源暂停保全，不进行真实采集或恢复。

Gate3纠正单合同耗尽不应全局暂停的回归，周期目录沿原30分钟退避；定向页作为本次全新before的一部分，不增加请求/行预算，仍须完整新after匹配。根1026/182/guard在3f83c611已PASS；最终源码回归和新证据前向锚定继续，不能提前标最终验收PASS。

Gate4追加数字序列化指纹边界：Python1/1.0仅在已确认可变字段中按同JSON数值指纹计算，不改原values/page hash/身份/未知字段。真实SDK14/14、Python211/211及隔离PG5/5通过；最终冻结源码全量复验继续。e97c32f已完成1026/182/guard及目录101/24回归，不能将其冒作追加后最终HEAD。
