# Server 收敛 Gate6：资源 → 排单 → 完成

## Baseline and authority

2026-10-20，7bf3唯一实现owner，既有审查者只读；按已批准D147及持续工程授权推进，不扩合并/部署/真实数据。`codex/server-production-resources` 从已独立核实main `996dfedc12da3527343cd3ff2aa5eea35497e10e` 干净创建，显式FF到 Gate5 `c6ca37b2f4b2ea9dc7487647b925b0ffcef98768`，初始工作树/index干净；没有继承用户dirty。三份输入摘要逐字保存于 `completed/2026-10-20-gate6-inputs/source-create-c6ca37b2/`。

Gate5精确c6已由既有工具一次上传并独立GitHub API核实；Baseline39402680845成功，Team39402675944尚在运行。Source39402671214失败：0033的 `quote_creation_order_contexts.sales_order_id` 未纳入归一只读引用清单。新FK被未知引用保护保守阻断，未误判安全或写业务；须先在原Gate5分支补齐引用盘点/合成回归，再重新交付/三CI。当前Gate6仅记录基线和只读评估，尚未实施资源API或UI。

## Approved minimal slices

- 6A：生产日历 → 地点 → 生产组，以及独立外发厂。Server空库不自动Seed，不复用Browser聚合normalize/save；稳定ID、停用而非物理删除，名称可重复。先后端typed表/API/回执，再复用既有表单接线；后台接口存在不表示页面或排单已完成。
- 6B：依赖6A与已有可信订单/交付计划。复用已批准工作日/日产量/交接公式，补真实日期、唯一例外、扫描界限和明确重排预览；不动态覆盖已开工/完成/固定日期历史。
- 6C：生产完成事实独立追加，依赖排单；具体事务/CAS/数量/审计验收另记，不把资源CRUD称生产闭环。
- 物流仓/路线/运输方式后置；关账税率/月目标及CNY销售/USD工价留Gate8，不重标已有RMB字段，不加换汇。

只读证据：Browser repository调用本地初始化/稳定storage；normalize空数组自动补默认日历/地点/宁波，不能搬为Server初始化。`calculateScheduleDates`现有无界循环，零工作日仅UI阻断，Server需前置校验与执行界限；特殊日期每日唯一、真实日期。资源启停不移除历史，组/地点/日历的可用性在新排单时共同检查。内部队列排序与遍历次序存在待6B核对点，不能机械复制算法。

沿用现有权限键，不因新增资源扩大真实账号权限或覆盖数据库角色配置。资源变更需版本、事务、幂等、fresh grants和不可变审计；冻结排单引用具体资源事实，后续资源修改不静默改变已保存计划。实际SQL/API及浏览器验证仅一次性合成库/私有profile，3001/50426/59069/62426和旧卷保留。

## Next

先完成Gate5引用修复和精确CI；本分支是独立本地准备checkpoint，不作为已验收Gate6交付。之后整合经过验收的依赖历史，先实现6A后台，明确未开放路线，再做既有UI接线。完整产品体验前仍须维护旧Quote长验收的过时规则和父级预算；原45/44/2结果不被抹去。

## 2026-10-20 18:20 恢复：依赖已绿，6A纯契约

前述c6失败及准备状态保留为发生时记录，由本节前向更新。Gate5最终 `5464aca3582bbec13b056727b7dc3bd8b938cb72` 已由一次正常push交付并经独立GitHub API核实。该精确提交的新Source [39405202505](https://github.com/clearisok/zhixu-erp/actions/runs/39405202505)、Team [39405206974](https://github.com/clearisok/zhixu-erp/actions/runs/39405206974)、Baseline [39405211718](https://github.com/clearisok/zhixu-erp/actions/runs/39405211718) 均completed/success；未用旧目标绿灯替代。main再次独立核实仍 `996dfedc12da3527343cd3ff2aa5eea35497e10e`。

本分支保留准备184b110e，并以显式merge `251287b943df4e240467c51dc56844d6ee79729a` 整合已验收5464历史，无冲突或继承用户dirty。修改前登记仅两个实现owner未跟踪契约文件；共享摘要修改前逐字、逐SHA256存档于 `completed/2026-10-20-gate6-inputs/reference-fix-5464aca3/`。

本小阶段仅新增 `server/production-resources/contract.ts` 及其测试：四类显式输入、服务端身份与版本边界、真实日期、非空唯一工作日/例外日、Unicode、非有限值、稀疏数组及伪服务端字段拒绝。生产组排序保留小数；外发厂不强加地点/日历；没有Browser默认资料、成本或关账币种。技术上限明确拒绝而非截断：1000例外、3650提前天数、排序绝对值10亿。

本阶段实际执行：纯契约8/8（369.9008ms）、全量typecheck、Node编译、两精确路径lint通过；独立审查无阻塞。尚无新数据库表、资源API、权限命令、事务幂等、CAS、资源关系查询或UI，不能据此标记资源能力完成，也未声称重跑完整项目/数据库/浏览器。下一步6A后台再依次验证这些边界，随后复用既有表单。保留旧45/44/2验收缺口、62426原镜像与全部真实操作限制。

收口再次实际执行纯契约8/8（308.0259ms），精确main源码/证据守卫PASS（11页/48能力/41继承UI路径，无新增UI），显式发布基线116/116（160044.8728ms）；无失败、取消或跳过。该基线不替代资源DB/API/浏览器验收。当前小阶段独立commit后继续6A后台，不创建累计重复PR。

## 6A后台小阶段（31e04281之后，尚未UI）

契约checkpoint `31e04281ea3178000d7f300c65f8d8179b2e8098` 已由既有工具一次push并独立API核实，NORMAL仅为当次通道观察。新阶段开始时main仍996、#120–127原头未合并/关闭，工作树/index干净，无继承用户dirty。前一阶段三摘要逐字存档 `completed/2026-10-20-gate6-inputs/contract-31e04281/`。

本阶段允许文件：0034新迁移及README、四资源service/routes、server/app.ts两行路由、精确migration ledger、资源集成测试、Source验收workflow的一条新测试命令及相应文档。没有UI、Browser repository、权限目录或真实账号变化。后台行为与API/事务完整边界见 `features/OPERATIONS_FOUNDATION.md` 的Server段；旧Browser段仍是历史运行事实。未登记新的完整生产能力，不覆盖原48能力或任何旧证据/截图。

实际验证链：

- 首次类型发现审计DTO不支持boolean/array；改为中文标量/JSON值且与原输入比较职责分离，后续类型/Node/精确lint通过，不修改共享审计模型。
- 初始契约+实际PG/HTTP21/21（6977ms）；补边界后加fresh-start/CCT组合38/38（19021ms）。
- 独立静态复审发现角色改权 r→rp 与原合并锁语句存在相反顺序风险（推导，未声称现场事故）。改为先稳定顺序锁r再锁ur/rp；增加实际executeRoleCommand门闩与HTTP保存并发。首次新用例错误地把原接口string版本写number，被400正常拒绝，日志保留；修正fixture后25/25（7106ms）通过，复审无阻塞。
- 最新资源/空库/角色/用户/来源组合59项：58pass、0fail、1skip（37874ms）。跳过的是Windows不适用的既有Linux CLI检查；Synthetic Python固定来源部分实际运行，不读取真实艾诺科。不得记59全绿，LinuxHostedCI另核。
- 全量typecheck/Node编译、production-resources/server-app/两集成路径lint通过。完整项目、数据库回归、最终发布基线与精确提交交付仍在进行，只有得到实际结果才前向追加。

验收边界：所有PG都为随机tmpfs一次性实例，只由本测试创建/删除自己的容器；未接入进程业务DB。当前新资源UI未开放，62426未升级，不能邀请用户体验后台切片或称6A/生产闭环完成。下一步先完成精确后台checkpoint、CI及复审，再复用既有表单，保留旧Quote长验收维护缺口。

冻结前回查原表单发现国家/地区原来是自由文本，故撤回仅ISO2/自动大写的新限制，保留中文/小写/地区标签与null；例外说明沿原UI必填，外发搜索包含原联系人/电话。0034同步这些约束，无历史Server资源迁移。审计标签为“国家/地区”；真实HTTP保存并读回“柬埔寨 / 金边”。最终源码25/25（7742.6712ms）、全量types/Node和精确路径lint通过，编译后的Node app模块实际加载成功；独立静态复审确认兼容修正，未重新运行DB。

首轮全项目927/927（228232.6834ms）、PG261/261（256116.4401ms）、全仓源码lint通过；最后兼容变更发生于该轮验证期间，不将其冒称精确最终源码PG结果。基线116/116（180734.5006ms）及main996源码证据守卫PASS，无新增UI。下面先创建本阶段源码checkpoint冻结，再做精确最终数据库复核和交付。没有静态前端变化，未声称新UI构建/浏览器验证；此前Gate5构建范围不挪用。

## 后台源码冻结验收与最终交付准备

源码checkpoint `8c178ba0b65e4117138fbc8e4cc1432a52d0dbf2` 创建后未再修改任何应用/SQL/测试/CI文件，工作树干净。实际冻结重验：43/43资源+空库+角色+用户（44800.9481ms）、927/927项目（218953.0055ms）、261/261数据库（243029.8422ms）全部通过；精确8c/main996守卫PASS（11页/48能力/41继承UI路径）。最终源码类型/Node/精确lint及编译模块实际加载、显式116基线保持准确范围。独立reviewer核对31..8c实际18文件、归档与25/43日志，无阻塞，未执行其未运行的测试。

新[不可变后台工程证据](../completed/2026-10-20-production-resources-backend-engineering.md)绑定8c，前次三摘要逐字归档 `completed/2026-10-20-gate6-inputs/backend-8c178ba0/`。此后只提交证据/状态文档，源文件blob必须与8c一致。旧58/1Linux skip、首轮927/261及新测试fixture版本错误的结果不覆盖。

网络：重新核对main的GitHub API读发生HTTP2流传输中断；未把exit0/空SHA当成功。随后依既有脚本一次有界只读诊断：默认Git成功读996（5327ms）、显式HTTP1.1对照失败（3184ms）、进程OpenSSL/HTTP1.1对照成功读996（2672ms），configurationChanged=false、pushSubmitted=false。只证明间歇通道，无永久根因结论，不改共享proxy/TLS/认证。持续用户授权覆盖本次安全恢复交付，无需再次提问；下一步精确最终commit守卫、既有工具至多一次push、独立SHA、三个命名CI。未核实不借Gate5结果、不重复调度/建PR。

## 6A界面接线开始（311f0ad8输入）

上一Goal轮为实际进展：独立源码/证据commit、冻结25/43/927/261验证、精确交付。最终 `311f0ad8da30b101200147a18c32db9b4abca9f6` 守卫PASS，默认一次push传输失败且独立远端仍31；随后有界进程OpenSSL/HTTP1.1/sslVerify=true仅精确仓库URL对照的一次push成功，独立API核实完整311。进程环境已恢复，不宣称永久网络修复。Source39411504225、Team39411508697、Baseline39411512585仅各dispatch一次；本阶段开始核实Baseline成功、其余两项仍in_progress，不重启live作业。receipt与精确CI元数据在本机ignored outputs。

新阶段main独立API仍996，开放#120–127仍原头，当前branch/HEAD为codex/server-production-resources/311，工作树与index干净，无继承用户dirty。允许接线现有三资源页面/共享表单字段、窄Server客户端与原请求缓存、导航/路由、精确UI影响记录和测试/文档；不改Browser仓库/Seed、生产公式、真实权限或现有环境。当前UI尚未完成，不提前标记能力。

先复用现有canonical命令与服务端已存digest，为POST/GET回执加性返回payloadHash，客户端核验原内容，避免只凭requestId/kind解除错误待核请求；不新增命令表或哈希算法。后续表单、会话owner、保存失败/未知、刷新恢复与数据权限都须实际Browser测试。历史输入、成功/失败以及后台源码8c证据保持独立，不挪作新UI验收。

本阶段独立核实311三个命名CI全部completed/success。界面接线按原表格/同页卡片与抽屉进行，撤回曾尝试的基础设施tabs/DataTable，未作为获准V2交付。独立只读复审发现并修复关联搜索Enter误提交、同页地点保留旧日历事实；后一项只增只读刷新generation，不重置草稿/未决命令。复审最终无阻塞，未替其声称执行任何测试。

本地实际结果：39/39契约+客户端+PG/HTTP（6880.5089ms），其中14客户端/17PG；全量types、Node编译、精确实现/测试路径lint通过，原Browser静态16/16。Server工作构建（明确标记311-resource-ui-working-v3，不是精确冻结SHA）14/14真实built UI（20190.2414ms）：空库不Seed、完整日历编辑、23候选分页和搜索Enter零POST、CAS保留旧输入/明确读最新、同页引用刷新、回执丢失刷新GET、未知明确同请求重试、摘要冲突阻断、只读/无权Enter、fresh撤权Enter、list及committed POST/known receipt的200/401跨A→B→A、6宽度及dirty提示。后续最终测试还增加卡片同步与日历390/1440像素断言；尚待执行，不能挪用前次14绿灯。基础设施新目标未升级。

首轮UI验收失败保留在ignored outputs：测试未等待异步选项或详情，或混淆背景与抽屉同名搜索控件，以及在真实事务提交前过早断言数量；修正明确等待和dialog作用域后通过，未以删除用例或弱化业务保护消除失败。原Browser静态测试随字段抽取定位新共享文件，16/16，不改变规则。精确main守卫PASS（11页/48能力/51累计UI路径）；旧228证据/48能力尚未标成新资源能力。新阶段三摘要修改前逐字SHA256归档到backend-delivery-311f0ad8，所有增量属root，无继承用户dirty。

下一步本地独立源码checkpoint冻结，再执行完整项目/数据库/发布基线和精确SHA构建/浏览器；这些未完成前不记6A工程最终PASS，不借311 Hosted CI。各类运维/真实数据/来源及资产退役边界不变。

源码checkpoint前新增断言已实际执行：14/14（20747.2784ms）通过，明确验证地点卡/日历卡都显示新名称、工作周和2条例外；外发6宽度、日历1440/390无整页溢出，截图本机ignored outputs保存。类型与精确路径lint通过。再次独立GitHub API核实main仍996，无额外范围或真实操作。待冻结后重验仍保留为下一步，不把本工作构建冒充提交构建。

## 6A源码冻结与最终本地工程证据

应用源码checkpoint `1da0b546e00c5eb6d4d215757f85e96c57a8f306` 后完成：927/927项目（275700.7987ms）、261/261数据库（292080.9625ms）、116/116发布基线（273878.9202ms）；全量types/Node/全仓lint与精确1da Server前端构建通过。该轮combined browser为30pass/2fail，不能记32绿：资源parent/响应式child的全局同名按钮selector选到另一日历。应用没有选错资源；独立核对失败快照确为其他合成日历的有效详情。导航子套18/18通过。随后只把两个site-origin selector限定到地点section，未改任何应用/SQL/UI blob，资源14/14重验通过（20691.8435ms）。

纯测试修正与不可变工程证据checkpoint `7b5fc1623b9ae8e60eae4dd4ac5ecc7b0032d364` 保留source1da全部原始历史。[新UI工程证据](../completed/2026-10-20-production-resources-ui-engineering.md)明确working与frozen、失败与重验、检查范围和未执行项，不覆盖[8c后台](../completed/2026-10-20-production-resources-backend-engineering.md)。39资源检查是同一已提交blob，未经更换测试消除实际缺陷。独立静态复审无阻塞，仅阅读代码/日志。

前次1da三摘要逐字SHA256保存在 `completed/2026-10-20-gate6-inputs/ui-source-1da0b546/`。当前前向加入唯一 `production-resource-server` 能力和7b冻结文档证据：229证据/49能力，implemented yes/isolated passed，merged false/human not-run/source not-applicable/18443与18444 not-deployed；旧Browser production及全部旧记录/截图不变。最终文档checkpoint继续精确main守卫、基线检查与有界交付，仅在独立完整SHA核实后对新HEAD调度三个CI，不借311绿灯，不建重复累计业务PR。以后新Gate再前向记录实际远端/CI结果，避免用当前未完成事件制造自证。

能力清单收口后实际重验：精确main996守卫PASS（11页/49能力/51累计UI路径），发布基线116/116（167003.2535ms），无失败/取消/跳过。独立只读复审逐项核对旧228证据/48能力及其他顶层字段保持，新增证据Git blob SHA256与清单一致，三摘要归档内容及规范化blob等于1da；当前增量仅文档/清单/输入归档，无应用、SQL、UI或CI变化。复审无阻塞，审查者未执行测试、网络或数据库操作。随后创建文档checkpoint并验证实际完整HEAD，远端与新CI仍待独立实证，不提前记为通过。

## 6B独立计算切片开始（d7172477输入）

6A最终 `d7172477b75569165d3a2c1b04ddc58ea24008b4` 已经既有工具一次安全上传及独立API精确核实；最终守卫PASS。Source39419852838、Team39419859614、Baseline39419866529各只dispatch一次；此切片开始时后两项success、Source仍运行，不借旧311结果，不重启live作业。传输仅本进程精确仓库URL使用OpenSSL/HTTP1.1/sslVerify=true，环境随后恢复，无共享配置变化或永久根因结论。

新分支 `codex/server-production-planning` 从本地可验证、独立API再次核实的main996干净创建，再明确FF到d717；工作树/index干净，无继承用户dirty。三输入摘要逐字SHA256存档于 `completed/2026-10-20-gate6-inputs/planning-start-d7172477/`。仅允许复用现有日期纯函数的加性扫描预算、Server队列纯预览及测试、正式Source CI的一条纯计算测试接线、V0领域辅助影响记录和文档；本小阶段不建表、不接路由、不开放排单/执行写入，不依赖尚在运行的Source CI授予任何运行能力。

只读审查已证实旧队列虽排序却按原集合遍历；通用编辑还会按最新日历重算已执行日期。新预览须真正按sequence/createdAt/id遍历，只输出未开工自动项的前后差异，固定/已开工/部分完成/已完成不移动；固定时段重叠明确提示，不让游标向过去倒退。复用特殊日期覆盖、交接日不计整工作日的原公式，不动Browser仓库、Seed或任何已保存记录。预览要求显式锚点，真实日期、唯一例外及全队列扫描预算，超界报错，不截断冒充成功。

后续6B事务仍须补有效SO保护、稳定颜色与商业依据解耦、同组版本/CAS及资源快照、请求回执和原子审计；新FK与全部版本/回执同步引用清单及指纹。DeliveryPlan只读需求，未知不补0，不反写订单。外发裸单价无币种/独立权限，不从客户确认工价推定；本计算切片没有任何金额。完整排单API/UI和6C完成仍未实现。

6B实现期间独立核实6A精确d717三个原run ID全部completed/success：[Source39419852838](https://github.com/clearisok/zhixu-erp/actions/runs/39419852838)、[Team39419859614](https://github.com/clearisok/zhixu-erp/actions/runs/39419859614)、[Baseline39419866529](https://github.com/clearisok/zhixu-erp/actions/runs/39419866529)。未重复调度或将其挪作6B新代码CI。#120–127仍原草稿头，不创建累计重复业务PR、自动合并或关闭。

新纯预览首轮18/18（641.5409ms）、原Browser排单25/25（238.3113ms）通过；全量types、精确三路径lint通过。最初误用不存在的`build:server`，没有执行编译；核对实际package后用正式`server:build`通过，原失败日志保留。本阶段还须完成复审、最终定向回归、精确基线/证据收口及checkpoint，不能把准备内核称正式Server排单。现有端口、容器、卷、账号与Browser资料未改，本小阶段未重新观察旧运行环境。

最终应用增量定向组合43/43（1622.018ms）通过：18新Server纯预览及25原Browser排单；全量typecheck、正式server:build、精确三路径lint、编译后planning模块实际加载全部通过。只读独立复审核对真实排序、保护谓词、固定重叠/未知结束、逐队列预算、输入副本和V0范围，无阻塞，未执行测试/网络/DB。正式Source CI加一条纯测试命令。下一步先冻结源码checkpoint，再为修改的历史feature文档追加新证据，不重写旧production记录；完整项目和发布基线须在该前向证据到位后实际运行，不提前称PASS。

源码冻结 `39190a91de55ee2c05e6cd38888745150e56dc52` 后未修改任何应用/测试/CI；只为feature文档追加 `production-server-planning-preparation-20261020` 前向记录，supersedes原production，绑定39190原Git blob SHA256。230条证据中的原229逐项不变，49能力及其他顶层字段不变；独立只读复核归档Git内容等于d717、V0准确且无提前能力声明。

本次实际最终验证：全项目927/927（269999.6728ms）、显式发布基线116/116（267931.9975ms）、精确39190/main996守卫PASS（11页/49能力/52累计UI路径）、精确39190元数据的Server前端构建通过。types/Node/精确lint/模块加载与43定向范围如上；没有新SQL/API/运行环境变化，未声称重跑新数据库或像素验收。下一步最终文档checkpoint/精确守卫与有界交付，送达后才调度新HEAD三CI；尚未发生的远端/CI不写PASS。后续先实现6B写服务，再6C执行。

## 6B后台开始（e5cc27da输入）

新小阶段baseline：`codex/server-production-planning` / `e5cc27dad98b125e54ad0af1cb831e5a148bd399`，工作树/index干净，无继承用户dirty；main独立API仍996。e5cc已由既有工具一次上传及独立API精确核实；Source39423655348/Team39423661759/Baseline39423667763各只dispatch一次，此阶段开始时Baseline成功、前两项live，不重启作业或挪用d717结果。三摘要逐字SHA256保存在 `completed/2026-10-20-gate6-inputs/planning-backend-e5cc27da/`。

允许修改范围：新增0035排单计划/版本/队列/订单集合版本/资源快照/回执schema，6B契约、repository/service/routes及Server app窄接线，抽取6A已有fresh actor与固定资源读取/资源冻结锁供两个生产领域共用，复用非金额稳定颜色身份、同步归一引用/完整指纹与SQL归属防护，显式migration ledger及纯/实际PG/HTTP/CI回归、必要feature/状态文档。计划与执行独立，6C的实际开工/完成仍未开放；没有新的权限grant、金额/换汇、Browser仓库/Seed/UI、旧环境升级或真实数据/来源操作。

后台设计保留每组/每订单及单条计划版本CAS；首版用有界全局计划写锁序列化跨组变更，避免未经验证的多队列锁组合，读取/预览仍独立。采用资源事实通过不可变快照保存，后续主数据修改不重算计划。资源CRUD与计划冻结共用窄资源scope锁，fresh角色锁次序与既有6A相同。所有计划变更/逐项审计/原命令回执同事务；未知只允许查原请求，不自动重发。这里记录实施边界，不提前声称SQL/API或并发已通过。

## 6B后台源码冻结前

e5cc精确三CI已全部completed/success，分别39423655348、39423661759、39423667763；未重调度。
新增0035及typed计划HTTP命令/不可变版本/资源快照/CAS/回执已完成本地实现，详见SERVER_PRODUCTION_PLANNING与D150。
只读复审发现来源颜色可在预览核对后竞争、中间历史可漏记两P2；已用物理SO集合冻结、源父锁与逐事件/即时历史校验修复。
物理组冻结抽为共用helper，商业颜色采用也使用同一来源冻结，不改报价/CCT/成交价模型。

实际工作源码：22纯；114相关组合（61438.7099ms）；抽取冻结后59相关组合（31305.9393ms）；
24新PG/HTTP及0034→0035升级（14164.4706ms），均无失败/取消/跳过。types、Node及精确lint通过。
首次PG16pass/1fail为测试错误期待安全日志含SQL异常原文，改为核对唯一请求编号；业务16子项当时均过。
类型曾发现nullable重排日期及合成报价旧必填字段，已修，不篡改旧日志。最后组404/角色锁等待撤权新增用例尚待最终冻结重验。
升级只用随机tmpfs PG，旧资源、账号/授权、订单/镜像/客户交期/日志逐字保持，0035七表空，不升级任何现有目标。
原sourceOwner≠target并发已通过，冻结期间来源替换等待；反向来源先提交使旧预览明确409，历史交期不搬移。
当前未运行最终完整项目/PG/发布基线或新HEAD CI；下面先独立源码checkpoint冻结，再逐项实际验证及前向文档证据。

8c180eb4933689177ba0a10a201aeee8e899c160为源码中间checkpoint，尚未交付。随后复审确认新的跨模块P2：
批量议价按有效root逐组锁物理成员，可能与重排的全体UUID顺序相反。已在fresh权限后、单订单锁前整批freeze，
没有改变价格公式/CCT/商业版本。真实PG交错用例用{02,04}/{01,03}，先排单后议价等待01，释放后两者均完成；
原无商业依据明确失败、不写金额。新PG最终25/25（10932.6034ms），类型/Node/精确lint通过，独立只读复审无阻塞。
0035文档准确标为新表/历史约束/来源父保护，不称只有新表。下面再冻结这份修复，全部原始提交与失败证据保持。

## 6B后台冻结验收（7ebfe985）

最终应用/SQL/测试/CI源码冻结`7ebfe9856719757f55bad63118e79d3ee9964729`，之后只有文档/清单增量。
实际冻结结果：60/60定向（37437.7084ms）、927/927项目（267224.1143ms）、261/261原PG套件
（282827.9616ms）、116/116发布基线（265674.8925ms），无失败/取消/跳过。60包括22纯、25新排单PG/HTTP、
1升级和12原议价；261不是新排单数据库套件的替代。全量types/Node/全仓lint、编译app实际加载通过。
精确7eb显式Server前端build通过，client/server/SSR的build-info均为完整7eb/session/Server quote+master/
writable/snapshot。未启动新用户运行环境或做新UI/像素验收。

main再次独立API仍996；精确源码证据守卫PASS，11页/49能力/52累计UI路径。新增D150和Server计划feature的
两Git blob证据后为232/49，旧230证据和49能力不改，不把后台标完整生产。独立只读复审确认最后整批冻结增量无阻塞，
其未运行测试/数据库/网络；实际交错测试由root执行。不可变[后台工程证明](../completed/2026-10-20-production-planning-backend-engineering.md)
保留前次失败、修正和未验证边界，三摘要逐字SHA256归档`planning-backend-7ebfe985/`。

下一步文档checkpoint后前向绑定工程证据、最终守卫/有界交付，仅独立核实精确远端HEAD后调度Source/Team/Baseline。
e5三CI成功不挪作后台新结果，不重复调度或建累计PR。此时新交付/CI尚未发生；没有部署/真实数据/来源/退役操作。

工程证据checkpoint`4989cb396fe8f81b19bc489756405e5dfdd75cfa`后只前向增加第233条工程记录，
绑定4989文档Git blob与7eb源码；49能力及旧232证据不变。独立只读核对旧230/49、两规则证据SHA256、
三摘要Git blob逐字归档、60/927/261/116日志均一致，无阻塞。原始FS换行与Git规范化blob分开核对，
不混用两种hash。最终清单再次实际通过116/116发布基线（166075.0818ms）及main996源码/证据守卫；
全types/Node编译与实际app导入亦重验通过。当前增量仅docs，应用/SQL/测试/CI与7eb完全一致。
最终HEAD随后由Git解析；远端/三个新CI仍须实际核实，不制造自证提交循环。

## 6B可信客户端准备（343a3ec1输入）

本阶段baseline为干净`codex/server-production-planning`/`343a3ec10bb7d6a8fe2b0d79ff1b4e0b4be51741`，
无继承用户dirty。343a由既有工具一次push并独立API精确核实；只为该HEAD各调度一次Source39434740100、
Team39434744552、Baseline39434752778，目前运行/排队，不借e5结果或重启live作业。main独立API仍996，#120–127原头保持。
三输入摘要逐字归档`planning-client-343a3ec1/`。本切片只准备可信preview/command/receipt客户端、actor范围的tab未决请求、
精确响应投影与测试，并抽取原planHash的相同canonical字节供浏览器WebCrypto共用；不改hash协议或SQL。
不会开放路由、挂载旧Browser仓库、生成UI、写实际完成/金额或升级任何用户环境。页面接线为后续阶段。

343a三项CI随后独立核实全部completed/success，未重复调度。新客户端工作源码实际通过15项客户端/outbox，
64项契约/纯计算/PG+HTTP/升级（16519.5617ms）。首轮62pass/2fail含新child及parent，原因是测试误以为
新fallback anchor必产生重排版本；原内核按已批准规则保留首条保存日期，合法no-op返回空变更。测试改为明确验证no-op，
取消继续使用已保存版本；未更改排期算法或删除断言。原失败日志保留。随后补缺订单/组版本及流式读取中lease失效负例，
15重验（536.6321ms）通过。全部types、Node、精确实现/测试lint及编译app实际导入通过。

可选独立bundle起初因esbuild包未安装而未运行，未安装依赖；改用仓库已锁定Vite，三个浏览器产物成功在内存生成，
无Node/PG执行或Browser仓库导入。无新页面/像素或运行升级声明。独立只读复审无阻塞，后续UI必须捕获session/epoch lease，
不能用仅userId回调冒称A→B→A页面验证。下面先独立源码checkpoint，再冻结回归与有界交付。

源码checkpoint`531b443f4fdb1ddc8fb5dce369e1b9e4212b640c`后实际冻结64/64（33620.4776ms）、
927/927项目（224872.3249ms）、116/116基线（223383.51ms）、全仓lint/精确main996守卫均通过，
11页/49能力/54累计UI路径。精确531 Server构建成功，build-info核实531/session/Server quote+master/writable/snapshot。
只读复审确认15路径范围、manifest不变及343三摘要Git blob逐字一致，无阻塞；当时工作树干净。

冻结后额外审查确认一处协议边界差异：Server先将逻辑result限1MiB，再附加hash/replayed或known回执外层，
客户端原来按整条响应限1MiB。增加固定4KiB传输包装余量，领域/请求正文限制不动；新构造单测覆盖POST、known GET
及超过wire cap取消读流，16客户端/outbox通过（542.1045ms）。这是防御性兼容修复；真实可提交重排能否逼近该边界未验证，
较大的完整preview fingerprint可能先阻断，不称已复现真实订单故障。独立只读审查确认此范围与措辞，未跑测试/DB/network。
下面为这份修复创建新源码checkpoint再重验，不把531全量结果冒称修改后的精确源码结果。

最终源码`8740997bc40bf7476ef7ad5929043f643d290400`冻结后，实际65/65定向（30137.4574ms）、
927/927项目（227581.9973ms）、116/116基线（226238.9769ms）全部通过，无失败/取消/跳过。
全量types/Node/全仓lint、实际编译app加载、精确874 Server前端build通过；client/server/SSR build-info逐项核实
完整874及session/Server quote+master/writable/snapshot。Vite再次内存生成两个客户端与共享contract浏览器bundle，
未安装依赖、未启动页面或运行环境。main独立API仍996，精确守卫PASS（11页/49能力/54累计UI路径）。

独立只读复审874相对531的三文件修复无阻塞；只增有界response余量，原hash/status/lease不弱化，构造测试不冒称真实可达。
所有应用/测试/CI自874后保持；当前仅更新共享摘要与任务，修改前三摘要逐字Git blob归档`planning-client-8740997b/`。
manifest仍233/49不变，不提前标记排单页面、完成或部署。最终文档HEAD随后以Git解析并独立交付/核对/CI，尚未发生不预记通过。

### 后续页面接线的只读预审（建议，尚未实施）

现有页面依赖全库Browser订单/排单，不能把Server DTO强转成旧模型或只取一页后伪装全局未排总量。
下一步宜先补两个集合读取：组总览批量聚合（含停用但仍有计划的组，队首不能叫正在生产），订单池先按全部有效订单
汇总未取消内部+外发计划、筛选后分页，数量保持精确字符串，未知不作零。单组队列同事务批量补订单摘要，不逐行GET详情。
现有订单编辑读取/6A分页执行方选择可复用；历史补明确hasMore与当时资源名称，不能套当前master，分页并发追加的锚定另验。
异常仅投影已证明的计划事实；实际完成、物流未接线时明确未纳入，不显示零或无风险。沿用原总览/队列/未排池及表单样式，
不接旧完成updater、自动重排、裸外发价或订单调价。只读证据：原page约692起布局、原风险函数185起、现service193–217读接口、
sales-orders/repository约440列表。此段是工程建议，不是新增API已实现或新UI获人工接受。


## 6B集合读取与稳定历史（1391feb5输入）

本Phase baseline为干净codex/server-production-planning / 1391feb5856bb23ab172f0eb7e6e7ffdcd51082e，
main独立API核实仍996dfedc12da3527343cd3ff2aa5eea35497e10e，#120–127原头不变；root唯一writer。
三摘要逐字Git blob归档planning-read-1391feb5/，无继承dirty。1391已由独立API与既有工具DryRun正常Git读取
双重精确核实，第二次push为零；首次工具分类矛盾与原始错误原因unresolved保留于本机安全reconciliation。
该HEAD仅各调度一次Source39440371972、Team39440379174、Baseline39440385738；后两者success，Source仍运行，
不借旧343结果，不重试live CI，不改共享Git配置。

允许增量为现有排单service/repository/routes及窄只读查询helper和对应合成测试，统一现有可信业务SQL，
补组总览、全部可信有效订单池、单组批量订单摘要及asOfVersion稳定历史。沿用资源自然排序、精确decimal与1MiB限额，
不汇总历史归一SO执行数据，不引入实际完成/物流/价格。无SQL迁移、UI挂载/路由开放、权限新增、来源读取或环境升级。
feature文档后续前向冻结，不覆盖旧证据；按最小充分真实PG/HTTP、类型/lint/项目/基线验证并由既有reviewer只读复审。

1391的三项CI随后全部completed/success并独立再次核对完整SHA，本机final回执保留，未重复调度。
读投影首轮73/73（32442.9176ms）、扩大114/114（60599.5401ms）通过；后者当时group create能力微调与并发
测试属于工作树验收，不冒称冻结HEAD。只读复审发现P2：订单目录hasMore可能承诺超100000 offset的下一页；
已在真实返回路径用统一边界明确422并补纯边界反例。另补伪加工profile无消费记录不可排单、同一快照count→外部来源
数量更新→page仍旧值及后续请求读取零值。历史同时验证52版本/50条页、期间追加53后锚定页仍为2/1，资源改名不补造历史。

最终增量实际115/115定向（61465.1851ms），包含计划契约/计算、真实PG/HTTP、升级、旧identity、订单议价/来源与
加工批次服务；无skip/cancel/fail。全量types、Node编译与精确lint通过，既有reviewer静态复核修复无新阻塞，未运行
测试/DB/network。root按已验证字节创建源码checkpoint，随后补项目/基线/完整lint/精确Server build及前向feature证据；
不因源码checkpoint换SHA重复运行未变代码的定向测试。无UI、迁移、执行量、真实来源/账号/业务库或环境变更。

源码checkpoint15295ecb265f91316476e4b010abc7b9083d2ac6后，927/927项目（233576.0933ms）、
116/116基线（232253.9186ms）、全仓lint、精确Server frontend build通过，三build-info完整15295/session/server/writable/snapshot。
首次编译app导入与前端build并行时输出文件未找到；随后串行Node重编译和实际导入通过，前次失败不抹除。
[工程记录](../completed/2026-10-20-production-planning-reads-engineering.md)保留115/927/116范围及未做浏览器/性能边界。

实际main996源码守卫首轮拒绝新feature的同路径supersedes：原7eb新路径未在main，修订链无法锚定真实base。
哈希有效不等于revision有效；未修改守卫、基线、原证据或能力。按独立reviewer复核，精确恢复7eb原feature，
将独立读投影的资格/聚合/分页/历史/权限写入有完整内容的SERVER_PRODUCTION_PLANNING_READS.md；原233不动，
先冻结新补充文档，再登记独立234记录。先前未提交的错误revision记录不交付，原失败日志保留；应用字节不变。
