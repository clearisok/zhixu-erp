# G6A 生产资源 Server：当前隔离工程证据

2026-10-24；本文件证明本机合成工程验收，不证明合并、部署、真实来源激活或用户人工接受。
基线 main 为 `e01a11952b648024c0bd6bf4259de429374981e2`，分支
`codex/server-production-resources-current`。从已收口 G5 的干净530前向，产品输入
`f0075f96295e1f53ac62d2b2576930a99fed563b`；实际验收源码为
`f441e70d133174dd8acc5fcd5943ca90afe74aa5`，tree
`d63a2416710b14499664257a509e819bff7a03ef`。两者之间仅4份状态文档更新，产品及测试不变。

## 范围与实现

D147 Gate6A：生产日历→生产地点→生产组，以及独立外发厂。原aaf→d717的25个非文档/
workflow路径先全部逐blob核对输入相同，再受控复用；不整包导入后续排单、完成、物流或出货。
三个既有页面继续原表格、同页卡片、共享字段及抽屉，恢复原Server导航；不是新设计。
现行main、G5、Quote回归及旧Browser账本保留。新增0034只建空表，无Seed、回填或目标升级。

资源保持稳定UUID、版本、停用历史及合法同名；启用父关系锁到提交，停用父项不回写历史子项。
接口仅可信session，读取当前数据库身份/权限，锁序兼容D146；列表搜索AND、分页最多100，
完整候选超过5000明确拒绝。日历列表不携带全部例外，编辑前读取详情。
request/actor/hash、CAS、资源/例外/审计与不可变回执同事务；未知结果只核对原请求。
原命令先完整保存并读回sessionStorage后才POST，不写Browser业务localStorage/IndexedDB。

后续CAS重新读取按钮的授权等待disabled、初始Drawer真实rAF/原生Enter撤权用例窄带保留。
旧200/401不能干扰新会话；CAS目录GET受控屏障期间不可重新读，放行后只一次点击。
测试清理复用现有owned Chromium退出确认；失败仍释放自建HTTP/PG，退出未确认不删profile。
未加长原父级240秒、轮询16秒、CDP20秒或端点30秒预算。

## 实际缺陷与红绿证据

合法日历命令1,048,218字节、实际outbox1,048,352字节，均小于1MiB；真实PostgreSQL
`jsonb::text`结果1,054,445字节，却超过0034不可变回执的同一上限。原真实HTTP为500、GET
unknown，原请求无法完成核对。两文件红验收24pass/4fail（含父项、审计计数连带），日志保留。

窄修复在既有SAVEPOINT内apply后按真实PG字节验证，覆盖changed及no-op。超界回滚本次资源/
例外/审计，只保存小型422拒绝；prior重放不变，其他SQL/审计异常仍整体回滚。客户端仅接受
精确身份/hash/状态code匹配的容量422，裸422或错摘要不释放原缓存。没有扩大限额、截断内容、
禁止原合法字符或改写0034。工作态28/28通过，随后下述冻结73项再次覆盖此修复。
真实API覆盖零资源/例外/审计新增、恰一拒绝回执、原ID重放/GETknown/缓存确认、大日历no-op，
以及仍可完整保存的1000项例外正控；不以预估JavaScript长度替代PG实际结果。

## 本次实际执行

规范长路径Git archive SHA256
`9489285a2bcdff69cbd9dd268451219f65b06b51b6c9d3f39ce1f9eaa147a00b`。
复用现有依赖，不安装。所有账号、PG、HTTP、合同/报价及资源均为本轮合成夹具；没有读取真实
DATABASE_URL、密码文件或艾诺科。新owned上下文与旧运行环境隔离。

| 检查 | 实际结果 | 进程耗时 |
| --- | --- | --- |
| 全量TypeScript | PASS | 23,103ms |
| Node编译、实际载入编译app | PASS / PASS | 10,479ms / 2,016ms |
| 全仓lint | PASS | 36,822ms |
| 资源契约/client/outbox/真实PG/API、空库、角色、用户、G5上下文8文件 | 73/73 | 50,307ms |
| 标准根非发布97文件 | 811/811 | 16,843ms |
| 旧G5构建before真实浏览器 | 2/2 | 13,742ms |
| 当前生产资源after真实浏览器 | 14/14 | 22,226ms |
| 当前导航连续性真实浏览器 | 18/18 | 19,800ms |
| Browser兼容构建、产物检查 | PASS / PASS | 10,054ms / 2,749ms |
| Server/session/snapshot构建、产物检查 | PASS / PASS | 9,699ms / 2,585ms |

上述测试均0失败、取消、跳过；计数包括父节点，不是独立业务场景数。资源fixture只改变自建库，
没有对现有业务库做0034升级。两种构建各45页、1fallback、110assets；检查器为已审1028独立
文件，未降低门槛。Browser保留1条users页modulepreload提示，Server为0。未重复未改变的
完整Quote/261数据库/Python旧范围，也不把它们写成本阶段新PASS。

浏览器实际覆盖无权Enter的一次POST403/零资源及回执、原ID恢复、已知/未知、权限等待、
CAS、目录分页、日历详情及关联资料当前值；无Browser业务键写入或新Quote/SO。
测试自建Chromium、HTTP、PG最终清理通过；这不是现有环境或用户数据清理。
预冻结独立复审只读，无剩余P1/P2；最终证据复审另记，不声称审阅者运行测试。

## 图像与构建身份

before渲染精确 `68a38b6bfb0785cc6019381f095660b38cf8fbf7` 旧G5 Server构建，当前f441后台/
测试只观察三个旧路由封闭、零资源API/POST及零业务写入。仅显式before模式允许外部旧静态目录；
after禁止覆盖，使用当前完整f441构建。没有把旧页面当作新after证明。

after buildId `resources-f441e70d-server-20261024`，buildTime
`2026-10-24T07:07:52.823Z`；session/writable/server/snapshot。前后原始build/geometry分别保存。
主控实际查看本目录8张PNG。工厂表单六宽1920/1536/1440/1280/900/390（DPR1）均无页面横溢出，
桌面抽屉560px、手机390px；日历1440/390抽屉480/390px，工作周及例外可读，底部操作可达。
这不证明全应用像素或人工业务接受。

- [旧基础设施1440](evidence/2026-10-24-production-resources-current/before-infrastructure-1440.png)
- [旧基础设施390](evidence/2026-10-24-production-resources-current/before-infrastructure-390.png)
- [新外发厂表单1440](evidence/2026-10-24-production-resources-current/after-factory-form-1440.png)
- [新外发厂表单390](evidence/2026-10-24-production-resources-current/after-factory-form-390.png)
- [新日历表单1440](evidence/2026-10-24-production-resources-current/after-calendar-form-1440.png)
- [新日历表单390](evidence/2026-10-24-production-resources-current/after-calendar-form-390.png)
- [基础设施默认764×485顶部视口](evidence/2026-10-24-production-resources-current/after-infrastructure-top-764.png)
- [关联日历当前值764×485顶部视口](evidence/2026-10-24-production-resources-current/after-related-current-top-764.png)

最后两图沿用驱动默认764×485，仅证明截图内顶部视口；不冒称1440或完整日历列表像素。
原文件calendar-list.png实际是该顶部视口，冻结副本据实命名；字节未改。

## 后续门禁与不扩大的边界

ignored `outputs/server-production-resources-current-20261024/`保存命令、完整日志、红绿及终态回执。
下一步仅前向绑定本证明、新图像与能力，保留原258证据/48能力及runtime对象。
精确三个Server路由清单随批准G6A接线更新；不由清单自动激活来源或升级目标。
发布134项及精确main守卫在元数据绑定后实际执行，当前不提前声称PASS。

本阶段新代码尚未远端交付，没有新累计PR或G6A CI。另一个已获单独授权的#125 API快进至4f
已核实，其3项PR检查各attempt1通过，无rerun/dispatch；不能据此证明f441已送达。
原Git exit1/STOP历史保留，不宣称网络根因解决。没有自动merge/close、部署、真实账号/业务库/
卷、凭据/Source、绑定/激活/调度、旧入口退役或共享Git/TLS/proxy/auth修改。
3001/50426/59069/62426、旧Browser及全部备份/结果保留。
本地能力implemented=yes、merged=false、isolatedTest=passed-historical、humanAcceptance=not-run、
sourceActivation=not-applicable、18443/18444 not-deployed；旧运行source/image不重观察或改写。
完整Goal active；排单/完成、4C、出货、关账及其业务/来源/切换前置仍独立。
