# 50426目标切换与旧运行资产收敛预检

2026-10-28；主控阶段基点 `ab3a49ee9d481c4530521859ffcc67f490e1a4b1`，`feat/closing-support-interfaces`，开始时clean。本片只读核实运行元数据并准备后续执行方案，没有切换、停止、重启、迁移、清理、登录或真实Source操作。F为本次事实，U为既有批准，R为后续建议，Q为未验证项；本方案不是新的执行许可。

原[Gate0](server-convergence-gate0-2026-10-20.md)继续有效；[机器依赖清单及原状态逐字档案](../completed/2026-10-28-runtime-cutover-preflight/receipt.json)记录每个容器、卷、网络、工作树、观察时间、来源hash和限制。不覆盖10月20日旧盘点或原失败记录。

## 1. 本次核实改变了哪些下一步

- F：既有GitHub连接器各一次只读GET仍核实main `6479a713e2b80228f008049519ebbd50d10601a8`，PR131 open/draft、未合并、head `4584deb786e0dd2fada0d998a16d166b00ccaadc`。没有Git传输、新CI或PR写入，API成功不解除NETWORK_DEGRADED。
- F：原Gate0曾记录运行中的3001/50426，**本次固定端口观察未发现这两个监听**。59069、62326、62316、18443、18444、62411、62428同样未监听；本次没有停止它们，也未判断停止原因。未监听不是数据为空、可删除或旧环境一定可恢复的证据。保留3001仍是U，不自动重启它。
- F：65139仍只由loopback gateway发布，五服务running/healthy，四named volumes、两网络；三个应用类服务的实际内容镜像仍为 `sha256:90e36de7c3d61ca137b2d5a4227e848b83ed57579bd146ce25501dbc6fe35f4f`。全部五服务没有可变工作树bind。此前111张非白名单表为空的证明保留原时间；本片不重查业务数据。
- F：52251仍由Node监听。Node直接解析 `closing-current.localhost` 返回ENOTFOUND，一次固定127.0.0.1＋原Host公开build-info对照返回200，source `a198d1829675092006708727624ee867be0e7b60`、session、Server、writable、snapshot。这里只证明公开构建身份；没有读取Cookie/会话、登录、读业务API或改DNS/hosts，不能将该Node解析限制写成浏览器页面故障或Git根因。
- F：新目标准备器 `ops/quote-trial/new-local-target.ps1:14–18` 明确拒绝50426；`trial.mjs:9–12`另有HTTPS和端口检查。**现有随机空候选工具不能原样承担50426切换**。不得删掉保护项、手改trial.conf或借restart绕过配置身份校验。
- F：`server/auth/session.ts:8,38–46`使用固定cookie名 `zhixu_v1_session`、`Path=/`。同一主机不同端口不隔离Cookie；新目标登录可能替换其他localhost端口的会话。它不构成共享业务数据库的证据，也不能通过清空浏览器数据解决。

## 2. 依赖矩阵与当前分类

以下路径中的W为 `C:/Users/Administrator/.codex/worktrees`；逐对象完整SHA、挂载owner、configured ports、实际发布端口、tmpfs目的地、卷/网络引用见机器清单。配置端口与当前监听分开记录。

| 对象 | 本次用途/依赖事实 | 数据/历史核实范围 | 当前分类及先决条件 |
|---|---|---|---|
| 3001及 `D:/workspace/preparesystem` | 端口未监听，工作树main仍e3e8e743；`AGENTS.md`有未提交改动；其Legacy数据库容器仍running | 未读该改动内容、DB或Browser数据；原旧报告保留各自时间 | U必须保留；不重启、不清理、不覆盖，不能因端口空闲释放其资产 |
| 50426旧入口及W/system-settings-ci | 端口未监听；工作树5490009b不在当前main祖先中，仍通过junction依赖continuous-material-display | 旧tmpfs/MemoryAttachment阶段原报告保留；本片未验证旧数据可恢复性 | 保护原代码/私有文件/备份；切换必须使用独立新项目，不能把新空库当旧环境升级 |
| 65139新持久空候选 | 五健康服务、四卷、两网络；只绑定冻结ops目录和私密输入，不绑定开发工作树 | 本片只读元数据；原9项恢复和空库证明不重跑 | 保留为已验证候选，当前不是50426，不改配置换端口 |
| 52251合成体验及PG290e734e433b | Node监听；公开build-info为a198。PG仍running；DB关联沿原体验证明 | 不读DB业务内容、不重做人工接受；原输入和合成记录保留 | 继续供体验，待替代目标接受后再单独决定去留 |
| 旧62428/62426及早期持久试用项目 | 各自旧镜像/配置和named volumes仍存在；当前固定62428未监听 | 镜像及数据不能因新候选成功冒称已经升级 | 保留恢复依赖与原失败现场；按逐项目备份、引用核对后再申请退役 |
| W/ainuoke-continuous-material-display | 为8棵工作树供给node_modules，包括当前主控、上传工具和system-settings-ci | 仅核实junction/realpath，不重装或修改依赖 | 必须先解除依赖再考虑归档；历史代码已合并不代表可删除目录 |
| W/erp-followup-governance | 为5棵订单工作树供给node_modules；两个旧容器bind该树 | 旧输出/缓存/来源原文未清点内容 | 保护；分别替代依赖和保存必要私有文件后再审查 |
| `D:/workspace/zhixu-ainuoke-c`与pr84-integration | pr84通过junction依赖前者；旧18444 gateway有3个bind指向pr84树 | 未读取历史数据库、证书内容或Browser store | 两者继续保留；不可只按PR已合并归档 |
| W/ainuoke-live-readiness、live-demo-readiness | 分别有4条挂载涉及2个容器、2条挂载涉及2个容器；现有业务/来源演示恢复依赖 | bind路径与状态已核实，数据是否独有未重查 | 保留；停止的容器同样有恢复依赖 |
| W/7bf3主控树 | 24条历史bind挂载涉及9个不同容器；本片开始时root clean，当前提交尚未送达 | 本片没有运行这些旧容器；ignored/private文件未全量清点 | 主控继续唯一owner；旧试验容器不自动重启或清理 |
| `D:/workspace/zhixu-order-material-b` | `docs/tasks/active/order-material-read-gate1.md`有未提交改动 | 只登记路径，不读/改其内容 | 保护其他任务；不能纳入本片stage、reset或归档 |
| 其余工作树 | 共31棵，14个node_modules junction；6棵HEAD不在观察main中 | ancestry仅证明提交历史，不证明ignored文件可丢弃；逐树结果见JSON | 全部retain pending review；不把clean等同无独有数据 |
| 其余容器、卷、网络 | 共74/199/37；8个容器running。元数据列明逐个引用，未引用卷也保留 | 没有内容、完整备份/恢复或归属审计 | 本片没有可无条件删除的清单；逐对象授权和证据不足时不执行 |
| Browser/本机5432/外部服务 | 本片未读取Browser stores、Cookie或未知5432业务内容 | 保留Gate0的未核实项，不用旧抽样推断全部为空 | 继续排除自动退役；真实Source/调度按D147逐次范围授权 |

本次对先前保存的69个容器ID/name/state、195个卷名及35个网络ID/name逐项比较，无missing/changed。先前容器snapshot的image列混合了tag和ID，本片**不把它与当前内容Image ID强行比较，也不声明历史镜像内容复核**。新的5容器/4卷/2网络正对应65139候选。原旧资产内容和可恢复性不在这个比较的证明范围。

## 3. 受控50426切换的实施顺序

当前只完成预检，以下均R/未执行。完整目标不缩减为“有新候选”或“代码已写完”。

C2的本地只读预览工程可在C0交付等待期间推进；下表是实际切换的依赖顺序，不要求等待网络才能准备工具。实际execute仍须C0、C1、C3全部满足。

| 顺序 | 进入条件与具体动作 | 验收/停止条件 |
|---|---|---|
| C0交付与合并 | Git有可证实的外部恢复后，集中交付136测试兼容及后继文档；精确核实唯一PR131，运行一次必要CI、复审；得到该精确head的明确合并批准 | 三项必要检查未绿、head/base不符或新认证/分歧/证书异常均停；不反复重跑旧CI |
| C1冻结最终候选 | 最终main固定后只构建一份精确镜像，固定完整source、内容ID、build-info及ops Git blobs；不为每份状态文档重建 | 不给a198镜像改标签冒称新main；当前90e与9/9证明继续保留原来源，不自动升级为新镜像结果 |
| C2准备受控工具 | 独立交付50426的preview/显式execute流程：仅此目标、冻结预览身份、全新Root/Project/卷/网络、端口复核、不可变镜像与ops；默认随机候选保护保持 | 2026-10-28只读preview已实现并独立验收，见[工程证明](../completed/2026-10-28-cutover-preview.md)；实际观察正确阻断非main候选。execute尚未实现；原准备器仍拒绝50426，禁止直接移除exclusion或手改既有配置；3001/18443/18444不被放开 |
| C3具体切换批准 | 提交最终镜像、HTTPS入口、准确新项目/目录/网段/端口、无历史导入、旧资产保留、维护窗口与失败处理，取得本次执行许可 | 源码/账号/数据范围或端口owner发生变化先重预览；不是本片一次性批准所有部署/清理 |
| C4新目标落地 | 再核对50426监听和Docker发布；有占用则停，不自动杀进程。新私密输入、五服务、四卷，显式新空schema init、objects-init、start | 沿用原TLS/PG/S3及默认verify-only；不从旧DB迁移、重置旧账号、清空候选、关闭证书验证或改系统信任 |
| C5原入口体验与运维验收 | 在HTTPS新入口独立登录；空库/身份/编译source、权限/导航、重启和恢复证据、人工业务使用分别记录 | 不把接口health当UI接受；不在最终空库填测试数据后清空。合成全链仍用独立测试环境；真实合同采集/激活/调度仍需具体范围 |
| C6资产逐批收口 | 替代入口已接受、备份/恢复和必要私有文件已保存、junction/bind/自动化引用解除后，提交逐对象退役批次 | 先停止旧写、保留历史；用户单独批准后才停止/归档具体对象。没有global prune、reset/clean、删卷或笼统删除全部旧工作树 |

推荐目标是 `https://localhost:50426`，符合原Server运维HTTPS检查；旧 `http://localhost:50426`书签不是同一origin。最终确认包含协议和证书使用方式，不增加同端口明文回退。Cookie可能影响其他同host端口的登录，须在切换说明中明确；不清Cookie、localStorage、IndexedDB，也不把不同host静默互换。

## 4. 回退和数据安全边界

- 预检失败不创建目标，不停止旧运行；输入准备/初始化中途失败则保护新项目现场，不自动重复init、重用其他卷或清理失败目录。
- `restart`不是升级或切换入口。只读元数据预检不代替原工具的镜像、config-hash、卷、网络、实际HTTPS与对象存储检查。
- 用户开始在新目标写入后，不能用“恢复空备份”回退，也不能承诺换旧镜像兼容0052。先保护新DB/对象备份，在新的独立项目验证恢复；不覆盖现有库。
- 旧50426当年使用tmpfs与内存附件；端口现在未监听并不能证明其旧数据还在。没有验证原备份和私有输出前，不能承诺“切回旧端口就恢复原业务”。本片不为验证而自动启动旧环境。
- 65139、52251、3001、其他旧端口、refs、卷、输入和浏览器档案都保留。新Source范围、正式账号、部署和资产清理分别需要其既有具体许可，不能由本片计划代替。

## 5. 本片执行与证据限制

实际执行：只读Git工作树/祖先、Docker白名单元数据、固定监听/进程路径、既有GitHub API两次GET、公开build-info一次域名失败及一次固定IP对照。没有process command line、Env、凭据内容、DB业务、Browser存储、登录、Source或调度读取，没有运行或重跑产品测试/Docker构建/CI。

清单工具首次因旧容器缺可选Health字段失败；第二份reader复用已完成的工作树观察并修正索引读取。配置端口补读首次因缺可选Tmpfs字段失败，保留原脚本/工具记录后使用固定索引读取。公开域名解析失败与IP结果分开保留。汇总首次错误比较tag与Image ID，在写公开文件前断言停止，随后仅离线收窄到可比字段；无额外Docker/HTTP采集。上述失败不写成业务测试失败或PASS。

本片只改计划、机器回执和当前接力文档；不改变baseline能力状态或UI证据。上轮10项状态检查及ab3精确门禁、a198业务/恢复结果继续绑定各自源码，不冒称本片新运行。本片离线核对6份输入文件摘要、3份原状态Git字节、4份代码证据通过；复审纠正挂载条数与不同容器数的表述，不改原机器清单。最终精确门禁在收口后按实际结果另记；当前Git写入仍降级，全局目标仍未完成。
