# 接力：界面已运行，完成D1992同单位确认的最后切换

2026-11-07，feat/material-followup-business-view，起点干净b60d09125f165f2972da52d81cbf32eb94893b10；main基线cb5cc29baa49ed7115fdb6c9506b6a80356936ea未刷新。不推送、CI或staging。具体用户V2批准及D190见tasks/active/material-business-view-2026-11-07.md；旧入口状态在tasks/completed/2026-11-07-before-material-business-view。

实际root D:/WeaveOps-Local，http://127.0.0.1:63051，固定8b3f4bc3a02111d63702f10bd9373889e7558d7b，app33472、原watchdog28348。localDemo原7权限保留，原preview.material-sync普通会话不替换。持久weaveops-local-postgres及卷、旧tmpfs zhixu-pg-it-d8777f722881均不可重置/停止删除。后台AUTOMATIC_RUNNING；本任务只GET和否定权限检查，0新手工任务，不额外取源。

新UI及数据已生效：business-facts分离流水与需求差额；6086354严格多字段替代缺MainID证据；自购14列、厂供8列、六计数、数量抽屉、13px及来源核实折叠。原arrival slots/对账/RBAC保留。D1992=PI2609-086，UUID d2e302cf-f0d5-404e-9474-e8ecf11ec81e，来源6651，30自购8厂供、20采购8入库5出运5出库，逐笔报告私密reconciliation.md。before-source.private.json是17:17:59不可覆盖。after-source.private.json/after-d1992-http.private.json是8b真实快照17:48:55；后台自然来源之后已到18:19:21，保留各自时点。

617实际HTTP已完成（live-http-and-data-proof.private.json）：613有物料、4完整空结果，失败0，249ready/368stale；2并行GET139.321秒，无源采集。46保护表哈希与5020完成任务不变，readonly刷新403且0手工任务。不要因最后仅D1992单位补充再重跑617。全源ID/数量对账all-orders-projection.private.json无遗漏。用户新确认“这批记录四流与需求同单位”仅20关联采购需求；material-unit-confirmations.private.json已在root保存20条，生成时18:24，严格证据/evidenceKey、账号/订单绑定。预览20应用，18采购缺口可算、2规格差异待核实、10未采购与8厂供单位未知；不扩到其他订单。

新能力server/ainuoke-source/local-unit-confirmations.ts只由local runtime挂载，复用原RR reader/MaterialConfirmation，热读文件；坏文件只撤下可选单位不隐藏原始来源。普通Server未挂载。单位文件真实内容不提交；不得SQL补指针/改采集时间。新代码和feature文档待checkpoint、前向绑定feature冻结证据、固定构建；用既有stage-automatic-release.ps1；在私密material-business-view-20261107/unit-final新目录保存第二次activation保护证据，原activate.ts不能覆盖第一阶段wx文件。只再优雅切换一次加载单位文件能力，后续确认热读不再重启owner。保留service.private全部既有字段、localDemo、enabledAt与migrationsDirectory；同步/认证代码未改。

已过20核心/IT、2单位解析、2展示、2SDK/发布HTTP、1私密确认数据库集成（新热读/无效文件回退场景），类型和lint；8b构建过，新能力须最后固定构建。新动态单元补充测试确认需求/采购单位变化失效，普通新收发不使单位失效。617HTTP首次比对JSON undefined差异已修验证方法，产品不改。前次SOURCE守卫56f38ad过，新feature版本须checkpoint后前向绑定再最后门禁。

CUA变量materialCandidate为56955临时只GET无worker服务，PID35384（exec session31595）仍在；应最后关闭候选页/进程。demoOutput为真实63051 D1992交付标签，重新加载并markDeliverable。viewport已reset；最终拍同1280x720 after-desktop.jpg、宽屏1920x1080及厂供/采购抽屉，保留before-desktop.jpg，最终回复实际嵌入前后图。已浏览器验收四流逐单、键盘、搜索/折叠、新单PI2611-057（2自购1厂供无采购）、空单PI2507-132、多批次PI2505-075，390/900/1280/1920无溢出；最后只补确认后D1992及必要权限/代表读回，不重做无关测试。需最终对账报告使用确认后的真实HTTP/sourceTime，保留原报告历史副本。