# G6B 当前 Server 排单：隔离工程证据

2026-10-24；本文件证明本机合成工程验收，不证明合并、部署、真实目标升级、来源激活或用户人工接受。
实际 main 为 `e01a11952b648024c0bd6bf4259de429374981e2`；分支 `codex/server-production-planning-current`。
实际完整验收源码 `cd73726babfaa86ffef671cbbe3a37fd542dace6`，tree `8a808ce1ff40a23cf8d6f3df70896efee5ce3a7d`。
本文和恢复语义的后续文档修正不改变该源码中的产品、SQL、测试或浏览器产物。

## 范围与保护

D147/G6B沿用D043的SalesOrder→Assignment，不恢复生产计划中间层。原d717→919的50个非文档/工作流路径逐blob核49相同，唯一资源service保留G6A容量修复。CRLF/LF首次整文件冲突在仓库0写入时停止，规范化后三方整合；不整包复制8f或中间8c。保留7eb整批物理SO锁序、15295一致读/历史及919移动布局。
0035前向新增，不修改0034、Seed或角色权限。可信合同或已消费加工SO可排单，不要求认领/商业采用；稳定颜色、完整不可变资源、单条/订单集合/组队列CAS、精确预览、显式重排及日期/数量公式保留。来源需求、客户交付、计划、实际完成与关账独立，不引入售价、工价或汇率。
6B实际只有planned/cancelled；完成、开工、物流、出货及关账仍依赖后续Gate。纯内核的执行保护字段不等于已有真实执行链。列表称计划队列/实际完成未纳入，未知不冒充0或无风险。
复用原组件、MasterDetail、订单池、队列、表单/抽屉，不新增V2/V3设计。技术outbox只占当前actor/tab的sessionStorage，不读写旧Browser业务库。

## 实际容量P2与恢复语义

合法日历命令回执1,048,294B，但完整冻结ResourceFacts包装1,048,855B，超原SQL1MiB；原预览200后command500/GETunknown。首次夹具错用不存在recorded_at列单独失败保留；修正后真实红34项32pass2fail（含子例和父项）。
现storeResourceFacts在原SAVEPOINT内按PG实际jsonb::text字节检查；超界回滚计划/版本/快照/heads/审计，只保存一条小型422拒绝，GETknown及原ID重放可解释，正常资源仍可预览。没有扩大上限、截断事实、改hash或拒绝原合法字符。工作态两文件52/52绿，冻结268项再次覆盖。
提交前SQL/审计失败可回滚；连接或COMMIT结果未知不能宣称未应用。保留原请求核对回执，不自动POST。文档复审已纠正这一区别。

## 本轮实际执行

新canonical长路径Git archive SHA256 `06439ae899089ee43a306b293b3bda1d7b4be4939bdee166b2ebc037ed0c7ea9`；复用现有依赖，未安装。
所有PG、HTTP、账号、订单、颜色、报价/资源均为自建合成夹具；未读取真实DATABASE_URL、密码文件或艾诺科。

| 检查 | 实际结果 | 进程耗时 |
| --- | --- | --- |
| 全量TypeScript | PASS | 38,571ms |
| Node编译 | PASS | 19,889ms |
| 实际载入编译app | PASS | 2,811ms |
| 全仓lint | PASS | 54,869ms |
| 标准根非发布97文件 | 811/811 | 29,422ms |
| 排单/资源/商业/身份/来源/空库与0034→0035升级24文件 | 268/268 | 155,341ms |
| 旧f441构建before实际浏览器 | 2/2 | 26,504ms |
| 当前排单after实际浏览器 | 17/17 | 35,070ms |
| 当前资源实际浏览器 | 14/14 | 24,622ms |
| 当前导航实际浏览器 | 18/18 | 21,851ms |
| 当前登录实际浏览器 | 11/11 | 16,473ms |
| 当前订单/P6实际浏览器 | 14/14 | 58,538ms |
| browser-build | PASS | 9,867ms |
| browser-artifact | PASS | 2,712ms |
| server-build | PASS | 9,699ms |
| server-artifact | PASS | 2,534ms |

所有上述测试0失败/取消/跳过；计数包含父节点，不是独立业务场景数。两构建各45页、1fallback、112assets，检查器为已审1028独立源码；Browser仅保留1条users页面modulepreload提示，Server为0。未将旧Python或完整数据库历史套件冒称本轮新PASS。
实际API覆盖幂等/并发/跨组锁序、来源父行竞争、稳定颜色、资格与撤权、资源快照/容量、审计失败回滚、SQL不可变历史、分页与集合头、批量议价和归一只读引用盘点；归一仍仅只读盘点，未恢复旧公开写入口；议价保留既有报价上下文。
浏览器覆盖403/权限等待、CAS后重新读取、提交已成功但回复丢失、原请求查询/精确重试、历史asOf翻页、未知缓存/导航保护、资源分页、固定/队列安排、取消/重排与超排提示。合成Browser业务键字节保留；自建Chromium/HTTP/PG最终清理PASS，不是删除任何既有环境。

## 图像、几何与身份

before严格渲染旧f441 Server构建 `resources-f441e70d-server-20261024`（2026-10-24T07:07:52.823Z），当前后台/测试只观察旧排单路由封闭、零计划API/命令及业务写入。after禁止外部静态目录，渲染完整当前C构建。
after `planning-cd73726b-server-20261024`；buildTime `2026-10-24T08:03:41.640Z`；session/writable/server/snapshot。两份原始build/geometry未改字节单独保存。
队列/表单在1920、1536(DPR1.25)、1440、1280、900、390实际检查页面横向边界；搜索/视图不重叠。表单桌面620px、手机390px，字段在弹窗内，底部操作可达。
主控实际查看11张：before1440/390，after队列及表单1440/390/1536，以及首次保存/超排/历史顶部。其余六张随同几何冻结，不声称逐张人工审图。首次保存、超排及历史三图是原764×485顶部视口，不冒称完整列表或1440截图。

- [before-planning-1440.png（1440×1000）](evidence/2026-10-24-production-planning-current/before-planning-1440.png)
- [before-planning-390.png（390×1000）](evidence/2026-10-24-production-planning-current/before-planning-390.png)
- [after-anchored-history-top-764.png（764×485）](evidence/2026-10-24-production-planning-current/after-anchored-history-top-764.png)
- [after-first-plan-top-764.png（764×485）](evidence/2026-10-24-production-planning-current/after-first-plan-top-764.png)
- [after-form-1280.png（1280×1000）](evidence/2026-10-24-production-planning-current/after-form-1280.png)
- [after-form-1440.png（1440×1000）](evidence/2026-10-24-production-planning-current/after-form-1440.png)
- [after-form-1536.png（1920×1250）](evidence/2026-10-24-production-planning-current/after-form-1536.png)
- [after-form-1920.png（1920×1000）](evidence/2026-10-24-production-planning-current/after-form-1920.png)
- [after-form-390.png（390×1000）](evidence/2026-10-24-production-planning-current/after-form-390.png)
- [after-form-900.png（900×1000）](evidence/2026-10-24-production-planning-current/after-form-900.png)
- [after-over-assigned-top-764.png（764×485）](evidence/2026-10-24-production-planning-current/after-over-assigned-top-764.png)
- [after-queue-1280.png（1280×1000）](evidence/2026-10-24-production-planning-current/after-queue-1280.png)
- [after-queue-1440.png（1440×1000）](evidence/2026-10-24-production-planning-current/after-queue-1440.png)
- [after-queue-1536.png（1920×1250）](evidence/2026-10-24-production-planning-current/after-queue-1536.png)
- [after-queue-1920.png（1920×1000）](evidence/2026-10-24-production-planning-current/after-queue-1920.png)
- [after-queue-390.png（390×1000）](evidence/2026-10-24-production-planning-current/after-queue-390.png)
- [after-queue-900.png（900×1000）](evidence/2026-10-24-production-planning-current/after-queue-900.png)

## 后续门禁与边界

完整命令/日志、红绿/夹具失败及原始结果保存在ignored outputs/server-production-planning-current-20261024。独立静态复审产品/SQL及恢复文档无剩余P1/P2，审阅者未运行测试；最终proof/manifest复审另记。
下一步前向绑定本证明、新图像、D150/production文档修订及新增Server排单能力/路由。保留原269证据、49能力和runtime对象。发布134项与精确main守卫尚未执行，不提前写PASS。
本阶段尚未远端交付，Actions=0，无新累计重复PR。#125的4f及其三项PR CI是独立事实，不借作本阶段验收。
未自动merge/close、部署、改真实账号/业务库/卷、真实Source/凭据读取、绑定/激活/调度或退役；未改共享Git/TLS/proxy/auth。3001/50426/59069/62426、Browser、备份和已有结果保留。
本能力implemented=yes、merged=false、isolatedTest=passed-historical、humanAcceptance=not-run、sourceActivation=not-applicable，18443/18444 not-deployed；原runtime source/image不重观察。完整Goal active。
