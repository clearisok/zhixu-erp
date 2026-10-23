# Gate7E：单SO成衣采集控制层工程证据

2026-10-23，Asia/Shanghai。完整G1–G5目标的后台切片；不是正式来源激活、跨次出货台账、关账、部署或用户人工验收。

## 精确来源与恢复点

| 项目 | 已核实事实 |
| --- | --- |
| 实际main | be9aaa3f4efa232e1451075a355f0ce42e35a69e，阶段开始和收尾前独立GitHub API均相符 |
| 开始基线 | 干净main建立codex/server-garment-collection-control，再FF原累计49dc50df82c28a23ab4242de6c51ae0e5b04bca4 |
| 原实现 | 9fc4b8d839f7b7d5123d0f2cddfd08da38e6a2aa，tree3c293dc550f41498e640f40cdbbc7520d977c9e7 |
| 原文档冻结 | 29ad965ee90d69f5fb5ff1464c883b91996f34ce，仅追加两证据，原295/58保持 |
| 最终业务源码 | d99282fa41788a385d94e91bf7f26a318dc7c0ac，tree4da0090b777191bb964ee57650af9fc973608a88 |
| 最终源码archive | SHA256 9dec9db84153222e4c140b7d5a6412b0be635908faf19ebda322d6907d3c4e41 |

root唯一writer；独立审查者仅只读。未reset/clean/rebase/force、安装依赖或改变共享认证/TLS/代理。原49dc交付/CI和#120/#123/#125九CI只保留其原范围，不据此宣称新控制层已送达或运行。仅#126/#127有具体合并批准；其他PR没有自动合并或关闭。

## 实现证据与不变量

- `server/ainuoke-source/garment-collection-control.ts`提供内部plan/collect/receipt。预览只读DB；作用域绑定实际库和连接、fresh actor、可信合同、原物理owner/link、有效归属、target/version、颜色、head、完整过滤证明、请求及有效期。证明重新验证本账号/本合同原C1/C0/C1，不接受非空hash作为通用证明。
- `0043_garment_collection_commands.sql`只新增空技术表。采前started确认COMMIT后才进入worker；相同actor/request不会第二次调用。网络阶段没有DB事务或advisory锁。started不自动回收，未知回执只按原请求查询。
- `garment-shipment-store.ts`提取caller-owned发布primitive，原wrapper的同步输入捕获、锁序、历史重放和CAS保持。快照、颜色、head、原审计和成功终态同事务；终态/审计失败不留下半发布。
- 失败回执只存安全静态原因、计数或unknown。历史读取fresh鉴权、重建scope/payload/hash和封闭形状；来源后来关闭、head前移或permit过期不重判原结果，不返回原文、密码、备注、金额或颜色明细。
- Node/Python worker固定6086979/ExpContractNo/is/[内层]，两遍各首页100行；最多1登录+2报表/3HTTP、每响应4MiB、报表累计8MiB、180秒、零重试/重登/翻页/重定向/代理。首遍total>100即停。正式页元数据必须1/100，诊断零哨兵不归一为正式页。Node独立重建原文hash、无损数字、双总数、合同、行id及两遍内容。
- 新旧两个SO引用进入原完整归一指纹；没有授权归一执行。0042非空升级核对所有原public表逐行JSON字节、旧publication可读、0043空及重复migration幂等；没有回填历史事实。
- 不注册HTTP、CLI、Catalog、scheduler或target启用命令。原Num/outdate、跨次观察不累加、空观察不等于取消、价格/CCT、生产完成和关账边界均保持。

## 实际验收与精确范围

全部数据为合成，数据库由原fixture创建并回收自有一次性实例。Python仅FakeTransport；浏览器使用私有Chromium profile和本地GET，不访问用户体验端口、既有账号或业务库。日志在ignored `outputs/garment-collection-control-20261023/`，不提交临时原始产物。

| 检查 | 源码范围 | 实际结果 |
| --- | --- | --- |
| 原定向/worker/0042升级 | 9fc | 31/31，16677.0159ms，0skip |
| Python全套 | 9fc；d992未改Python/worker | 181，1.895s，OK |
| 全项目npm test | 9fc，运行期间主树冻结 | 952/952，656922.3078ms，0skip |
| PostgreSQL/API | 9fc | 270/270，292183.5075ms，0skip |
| 原成衣观察/客户端/store/升级 | 9fc | 85/85，45460.8512ms，0skip |
| 原归一执行引用 | 9fc | 33/33，35977.9668ms，0skip |
| 实际Server built UI | 精确9fc archive构建 | 13/13，37960.0029ms，0skip；六宽度、七合成角色、历史/过期/撤权/迟到响应 |
| 全量types/lint/Server build/显式Server UI build | 精确9fc archive | 全部退出0 |
| 复审修复后定向 | 最终d992相同两份代码/测试blob | 33/33，17460.7503ms，0skip |
| 修复后Server build/scoped lint | d992 | 退出0 |
| 最终全量types/lint/Server build/显式Server UI build | 精确d992 archive，无.git、仅junction既有node_modules | 全部退出0；未安装依赖 |

没有把9fc的952/270/85/33/181/13改名为d992全量重跑。d992相对9fc仅控制器两处边界和对应测试/文档改变；app/components/features/public/templates/worker/database/Python的完整Git ls-tree逐字相同。最终d992全量类型/lint和两种构建是另一次实际执行。默认Browser构建未在本阶段另跑，原Browser存储/数据未操作。

## 保留的失败与独立复审

1. 初轮Python发现total>100仍执行第二遍，改为首遍停止后181全套通过。最初三个新TS窄化错误修复；原根typecheck另扫入旧ignored镜像context，原文件保留，用精确Git archive外部context完成全量检查，没有改tsconfig掩盖。scoped lint未用变量改为明确clock校验。
2. 冻结9fc独立复审发现1项P2、无P1：最后异步范围读取可能跨许可到期。独立9fc临时context新增负测，确实多一次worker；同时复现发布已确认回滚、随后失败终态COMMIT回执丢失却把回滚标为false。红测23项20pass/3fail，包含父测试失败，实际为两个断言案例。
3. d992在最后读取后、worker前再次fresh，过期保存0/0 not_published原回执；独立保存发布回滚确认，成功发布COMMIT未知不能因随后ROLLBACK命令成功而宣称回滚。补真实第二DB actor的回执/许可拒绝和两类COMMIT丢回执断言。修复后33通过；独立只读复审未发现剩余P1/P2，审查者未运行测试或真实来源。

## 冻结、交付和未完成边界

此报告冻结时，新发布134、精确main守卫、远端精确交付及Source/Team/Release CI尚待后续独立结果。文档和能力只前向新增；原证据、58能力、23UI影响/原批准/截图和日期保持，最终ledger将增加本切片59th scoped能力，不能借CI或ledger开Source或入口。依赖仍未合并，因此先交付验证引用，不创建重复累计业务PR。

真实6086979固定许可已用，本阶段0新Source请求、0凭据/私密报告读取、0现有业务库/账号变更。当前真实过滤证据仅原账号唯一合同完整首页；正式worker遇零哨兵/多页仍fail closed，不宣称真实正式采集已成功。操作者接线/新查询授权/激活、多页实证、稳定事件/取消、覆盖v1、关账三待决、50426目标切换/人工接受和逐项退役仍各自待Gate。

3001/50426/59069/62426/62326/62316/62310/62200/18443/18444、旧Browser/账号/数据库/对象/卷/其他工作树及原0c镜像未操作。两18443/18444的日期/source/image只保留历史记录，没有重新核验或部署。完整Goal继续，不以本后台切片宣称全项目完成。
