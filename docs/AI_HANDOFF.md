# 恢复点：Gate6D物流资料后台，主控唯一writer

2026-10-21；main独立GitHub API核实996dfedc12da3527343cd3ff2aa5eea35497e10e。
root唯一writer，既有server_convergence_review只读。当前codex/server-logistics-resource-store从干净97cfa显式FF到f59cf6ec0b383771dd14350bf99053dd85404a36，无继承dirty。
[阶段任务](tasks/active/server-convergence-gate6d-logistics-2026-10-21.md)；[三摘要原输入](tasks/completed/2026-10-21-logistics-store-inputs/f59cf6ec/)完整保留此前日期/hash/结果/限制。

输入f59包含已批准D152和D1933真实观察，最终源码守卫PASS；当前新阶段仅自身代码/测试/文档dirty，没有未知dirty。新0037不改0001–0036，不更动共享权限或UI。
已实现managed-contract分派六kind；旧PRODUCTION_RESOURCE_TYPES/ProductionResource/ResourceOutcome默认仍四类型，原hash兼容。service复用唯一事务writer和global资源锁；logistics-store只有父子IO。
新hubs及运输方案聚合沿用infra edit，schedule.view可读；新UUID服务端分配，保留所有旧mode（含停用），不能搬移/删除；父CAS及子列表位置一起保存。
同Hub/Site最多一启用方案，停用历史可并存。明确父仓/地点/日历启用，停用不级联。列表只子数量，详情才全列表。新kind缺0037返回503，原四资源仍支持其旧schema，启动只校验。

已实际验证：新kind原400红测0通过/2失败（5846.7471ms）、首轮12/12（7888.9947ms）、组合纯/新旧PG/HTTP/升级59/59（21194.6082ms，0失败/取消/跳过）。
升级在0036先建可信合成SO、计划和10.125实际产出，全部原public业务表除schema_migrations字节不变。真实COMMIT后丢回执只读恢复、全局freeze/Hub锁、原子重排/停用/追加、后段子项及审计失败全回滚、撤权、100项上限均覆盖。
广回归实际PG269/269（264890.3776ms）、生产98/98（70871.3071ms）、项目927/927（379376.4553ms）、全lint及候选build通过；对应原生进程均已terminal。候选build环境标记f59/工作树代码，不冒称精确源码发布证明。
reviewer指出新物流result生成UUID后可能超原1MiB回执限制，主控真实红测16pass/2fail（7930.083ms），500≠期望422。已在SAVEPOINT内用PG实际JSONB字节测量，仅新物流kind超限回滚父子/审计后存限定422/logistics_result_too_large，旧四类型/表约束不变。
最终新旧纯/PG/HTTP/升级组合60/60（22905.2786ms）、全量types/Node编译/改动三路径lint通过；269/98/927按容量修复前时序保留，不假称复跑。reviewer只读核对修复与红绿日志，无新增阻断，未代其声称运行测试。
本阶段新基线116/116（319435.4533ms）、working-tree精确main996/f59守卫PASS，11页/51能力/累计63 UI路径/errors空；完整manifest与f59相同，3份输入档案与Git blob字节一致。
无遗留长测试进程。下一步独立源码checkpoint，精确HEAD/main守卫与源码标记候选build，再文档收口commit。不得把本机通过记新Hosted CI/交付，远端仍STOP。

D152：Num/outdate已明确；单据/进仓/交期分别保留，不自动关账/收入/生产完成。D1933一次16/16行、4单据6颜色9869件；styleNum分色参考9250差619不裁剪/覆盖。
D1933和D1935各一次真实许可均已用完，无重试/翻页/来源激活；受保护原文不stage/展示。完整Source正式行身份/生命周期/可信合同分色/存储/API/UI尚待工程。
f59新证据链116/116（345552.8014ms），精确main守卫11页/51能力/累计63 UI路径PASS；原243证据保留新增1叶=244，旧PNG/能力不变。当前物流代码不借此PASS。
Gate6C d6三CI和工具664f唯一CI各自证据保留；Git664f真实push exit1导致STOP_AUTH_OR_DIVERGENCE，虽然远端exact，具体原因仍未知，不重推/更换认证。
保护3001/50426/59069/62426、旧卷/工作树/Browser；62426仍8175，未升级。无新Hosted CI/PR/merge/close/deploy/真实账号/业务库。
Goal active/未完成；Gate8加工服务产值、关账stale、旧CNY工价待决，CNY销售/USD工价不换汇/重标历史。安全工程/Git持续授权不扩新增真实来源/部署/退役；D109 HTTP原风险不重问。
