# AI handoff

## Active — PR #91 immediate draft/default settings acceptance repair (2026-10-10)

- 原分支 feat/quote-two-step-creation，起点 a3335ed；D-102 取代普通电脑两步交互。阶段 A/B 实施中：creation-defaults 复用 receipt 与原 writer；0011 仅新增可空类型/国家设置，普通点击直接建有编号草稿、返回保留。类型条只读，generic PUT 类型变更拒绝。Server 设置沿用 Bundle/CAS/审计，失败保留输入。
- 本轮实际创建 API28/28、Q3/Quote API28/28、local identity3/3、auth/frontend83/83、npm679/679，typecheck/lint/Server与Server frontend PASS；非空0001–10→0011旧记录/旧checksum保持。Chromium66/66已实际通过，新增离开提示/详情五档截图后的最终回归进行中；尚未构建新候选。订单 PR92 文件范围已核对，提交前再次检查交集。
- 18444 仍为旧 bb451fe/66de 两步版，0001–10；本次**没有**环境访问或更新。新增0011及新候选需先工程/打包验证，等待用户单独授权 Preview 升级；18443/真实环境不动、不自动合并。

## Historical — Desktop two-step Preview deployment (superseded interaction)

- **PREVIEW UPDATE PASS / USER ACCEPTANCE PENDING**：用户从`4bb0df4`执行前停点再次明确授权。重核完整字段/重复项、备份manifest/config/恢复卷字节、旧表哈希/全部3对象/无writer/前9checksum PASS；复用`pr91-upgrade-2026-10-10T05-20-53-187Z`（FULL RESTORE PASS），正式runner只应用0010。18444仅app/gateway替换为66de不可变镜像，实际HTTPS源码`bb451fe1895ef48eed7a8215dd1d88acd2cc0e9f`，0001–0010 current/三个主要服务healthy。DB/object容器、卷、网络、TLS保持；27报价/3附件及关系/2账号、原图SHA和业务日志完整保留。实际只读Chromium：可信登录权限、100px/刷新/四档桌面、大图256×192/4767字节及390触屏、两步前进返回取消零创建PASS。没有新增演示报价；两个正常登录注销仅产生认证技术记录，用户profile/偏好未触碰。更新后挂载核对曾暂停：三个gateway Source为同一Windows路径的Docker Desktop表示，完整原始差异保留，Compose来源不变+权限/其他字段+主机/备份/容器SHA逐项证明后仅继续只读验收，未重复部署/迁移或回滚。详见[任务证据](tasks/active/quote-two-step-creation.md)。下一步用户打开18444/new验收；不自动merge，不动18443/其他环境。

### Historical — pre-execute stop (resumed under explicit authorization)

- **FULL RESTORE PASS / 执行前再次STOP（未执行0010）**：本窗口备份的隔离PG/3对象/19恢复文件实际恢复、旧表哈希/关系/对象逐个大小SHA和大图7770409字节读回全部PASS，manifest SHA `a43cf332a0ba14d8a14bdb1c648359661d4790b5400e55a96479667b85cc1b5d`，owned cleanup PASS。恢复checkpoint `bc8303e861d286dd537d0d70c54d7c1e8d406c3d` push返回ref-lock但一次GitHub核实exact送达，无重推。最终execute在比较Docker Mounts数组原始顺序时停止，未触及迁移/配置。逐项只读差异为空；修正仅排序、保留全部字段，6项正/反例PASS，随后实际verify-execute **READ-ONLY PASS**（精确目标/备份/config/旧表/全部对象重读/无writer/前9checksum/只pending0010）。遵守用户异常即STOP，未再次调用execute。18444 app/gateway仍STOPPED，DB/object保留、27报价/3附件/2账号、ledger0001–9、旧d2a3509f不变。下一步需用户确认继续这一停点，然后使用既定66de/bb451fe执行仅0010和app/gateway更新；不自动恢复或重init，不动18443。详见[任务证据](tasks/active/quote-two-step-creation.md)。

### Historical — previous stopped window (resumed by explicit user authorization)

- **当前授权窗口 STOP / Preview维护暂停**：用户已授权指定bb451fe/66de候选更新隔离18444并确认无未完成操作。GitHub PR91/local为`8c6578b98311a9a14211d236d18b2376f8cb4343`，main仍84c8c5b。新完整备份已保存；隔离PG恢复、仅0010、verify-only及旧行读回通过，随后检查脚本把ledger数字版本按text别名排序成1,10,2导致比较失败；不是已证实的checksum漂移。脚本已修正ORDER BY限定整数列，但**未继续执行**，对象存储恢复NOT RUN，完整恢复证明未完成。18444 app/gateway保持STOPPED；DB/object服务保留，27Quotes/3附件/2账号、真实ledger0001–9不变，真实0010和应用替换NOT EXECUTED。隔离资源cleanup PASS。下一步须用户确认继续，先完成完整隔离恢复证明；不得自动恢复服务、迁移或初始化。备份hash/详细停止点见[任务证据](tasks/active/quote-two-step-creation.md)。18443及其他环境未动。

### Historical — previous packaging checkpoint (authorization status superseded above)

- 当前候选打包收口 **CANDIDATE COMPATIBILITY PASS / PREVIEW UPDATE NOT AUTHORIZED**。源码/打包checkpoint `bb451fe1895ef48eed7a8215dd1d88acd2cc0e9f`远端exact核实；镜像 `zhixu-quote-two-step:bb451fe1895e-compat-20261010t044707z`，ID `sha256:66de9c0df09c98b1b50659f2fd53096e8b4a0ff06ba26de4bd03ec353011efce`。仅临时tracked-only context0008恢复已发布LF字节，语义/Git历史SQL/0010不改。新镜像前9份原始checksum与18444当前ledger逐项一致，仅0010pending；实际Linux非空旧镜像基线→仅0010→旧表哈希不变/重跑skip→可信创建重放→重启GET回执/cleanup PASS。本轮packaging12/12、creation25/25、database-ops2/2+evidence6/6、typecheck/lint/Server镜像构建PASS；未重跑Chromium/npm全套/默认Browser构建/COS。详细10份hash与工具命令在[任务证据](tasks/active/quote-two-step-creation.md)。

- P1/P2工程源码 `71f8b6a9c7e550f5551e79cd9c8ec832b7cf9b04`及既有Chromium68/68/local+Session4/4/auth83/83/npm679/679证据保留（不是本轮重跑）。旧71f8镜像checksum阻塞由上述新候选关闭，旧tag不改。本轮前后只读18444仍healthy/source d2a3509f/27Quotes/3附件/2账号/0001–9 applied/0010 absent，全表快照hash不变。旧26Quote/2object备份不覆盖当前状态；下一轮须另行明确批准Preview维护停机、新完整备份与隔离恢复、仅0010升级、仅app/gateway替换和只读验收。本轮这些操作均NOT EXECUTED，用户验收PENDING。

- 单主Codex；安全工作树 `D:\workspace\zhixu-quote-two-step`，branch `feat/quote-two-step-creation`，clean base/latest verified main `84c8c5b520dbcb956ae27a24103e6607a1c227c3`（#89/#90 merged）。API checkpoint `1b927b234e7e8f3b7efe4c1ed3cafe935fe8788e` push返回curl56后一次只读核实exact远端SHA，已送达；不盲重推。其他worktree/真实环境未动。
- 桌面两步UI、原子创建/参数快照、加工材料可见性 ENGINEERING PASS。最终真实Chromium67/67、列表像素/缩略图27/27，创建DTO/API/非空升级及dump恢复25/25，相关API63/63、foundation/CCT/空库28/28、auth/frontend83/83、npm679/679；typecheck/lint/Server和两种frontend PASS，默认browser/browser/writable/session。首次断言/等待错误及最终标题ref lint错误已修正并重跑，证据未隐藏。
- UI checkpoint `11d8da9a36450b3da1335b3ad5d275de459b86de` push返回ref-lock但一次只读ls-remote确认为exact SHA，无分歧/不重推。候选 `zhixu-quote-two-step:11d8da9a3645-20261010t032052z`，源码11d8da9全SHA、server/server/writable/session；实际Linux Node启动verify-only拒绝空schema→正式runner仅disposable应用10份→可信创建/同token重放→重启回执持久化/cleanup PASS。未挂持久卷、未发布host端口、未连接COS。后续文档SHA不是镜像重建。
- 新0010只存preview/actor-bound receipt，旧0001–0009不改；新文件固定LF，不批量改变历史换行。技术默认CNY/incomplete有明确来源；master IDs保留TEXT；未知结果原token GET，丢失响应后刷新可恢复已提交ID，pending不授权自动重POST。详见 [任务证据](tasks/active/quote-two-step-creation.md)。
- **18444新增migration必须另行批准**，本轮仅disposable验证/独立候选；不操作18443/真实DB/COS，不做Intake、已有类型切换、Excel筛选或自动merge。下一步审阅唯一功能PR/迁移恢复证据，用户批准后才允许重新核对18444身份/备份并执行新增迁移和应用更新；USER ACCEPTANCE PENDING。
- [原状态/接力历史](tasks/completed/2026-10-10-pre-two-step-state-history.md) 保留所有日期/hash/测试来源，不再将旧OPEN/网络错误/阶段状态作为当前操作指令。
