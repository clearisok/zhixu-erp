# Server交付计划维护接线

2026-10-22；root唯一writer，既有server_convergence_review只读。Branch
feat/server-delivery-plan-maintenance-ui从独立main996dfedc12da3527343cd3ff2aa5eea35497e10e
建立，仅FF至干净377a3c9eb40a852851c1d4e05296a4d30f4ce9e9，保留原始提交。
三份输入摘要逐字节保存于../completed/2026-10-22-delivery-plan-ui-inputs/377a3c9e/。

## 明确批准与前置

- [具体批准](../completed/2026-10-22-delivery-plan-maintenance-ui-approval.md)记录原问题、
  用户“按草图实施”及原HTML哈希。此为V2交互批准，实施前有精确路径记录；不扩大Source/DB授权。
- DeliveryPlan后台D100与D154在原144三CI通过；本次只接已有GET/PATCH/receipt，不改SQL/API语义。
  客户合同交期只读，首次人工介入永久拥有整集合；数量变化不自动重分计划，作废保留历史。
- 前置377已精确远端、精确main守卫PASS；原一次Execute STOP与零push DryRun
  DELIVERED_VERIFIED都保留，原错误原因不推断。Source39699348958、Team39699352582、
  Release39699355389均attempt1，启动时仍运行，不冒称通过。消费记录在ignored
  outputs/garment-filter-screening/ci-dispatch.json，后续只读核实，不重复dispatch。
- 前置固定工具一次真实调用仍为candidate本地失败、0 HTTP/0报表/未读凭据；离线解析修复不等于
  真实合同过滤已验证。不得再次运行已消费run-authorized-filter.mjs，不新增采集、绑定或激活。

## 接线与安全约束

标题旁“维护交期”打开原Foundation Modal，新增/修改/作废日期与数量，预览后保存；合同事实
只读、差异仅提示。保留历史和可为空/零的系统默认行；只有明确变更才进入upserts/voidIds，
未改的零/null默认行不被提交为非法人工输入。人工输入沿原正十进制、64字符、有效日期与100项
命令上限；不使用浮点合计，不强制计划总量等于合同量。允许明确作废全部有效行。

复用order.view/order.edit和Server事实，不引入认领、负责人、商业采用或金额权限前置。
历史alias继续只读。不要因为其他模块的完成/关账规则擅自扩展DeliveryPlan后台限制。

GET/PATCH/receipt客户端校验原DTO白名单、身份、版本、行、数量日期和完整有界响应。
POST receipt仍只读核对，带原PATCH精确body、requestId及X-Zhixu-Request；unknown不代表失败，
不自动PATCH。已知applied/rejected与401/403/网络/损坏响应分开；错误消息不注入页面。

发送前原意图先保存到当前actor/tab的单一sessionStorage pending槽，仅保存待核对Server命令，
不是Browser业务repository/回退。不同订单不得覆盖未决意图。保存失败不发送；未知结果只核对；
只有匹配终态才清槽。当前SO/session对象/permissions/layout lease控制所有异步结果，覆盖同用户
ABA、切单、卸载、撤权和过期；迟到401不能使新会话失效。硬刷新恢复只读原请求，不重发写入。

来源维护与交期维护的navigation/BeforeUnload/logout guard使用独立owner后合并，不能一个关闭
清掉另一个阻塞。保存成功后，原只读交付计划披露若已展开也须按新版本重读，不能继续展示旧值。
不修改Source、订单身份、商业/生产或其他数量历史；不复用Browser writer及其浮点/备注字段。

## 客户端切片（页面尚未接线）

批准文档已冻结在89993412de4cc3f8f3ef19488d20bac67f85c3d9；manifest仅追加该审批证据，
268→269、能力57不变，原证据不改。精确V2路径记录在ui-changes/server-delivery-plan-maintenance.json；
客户端checkpoint只记录三个实际变化helper，后续产品接线再前向扩展，未实现路径不预报通过。

三个纯模块复用Server命令校验，提供白名单有界读取、原意图PATCH/receipt、仅差异draft与
actor/tab单槽pending。26/26合成测试通过（478.3262ms），无skip；类型与完整lint通过。
初次类型检查发现ES目标不接受BigInt字面量，已局部改BigInt(0)，未改tsconfig或依赖。
既有只读review发现P2：只核对nextVersion会误认漏改/漏作废结果；现PATCH与receipt共用
逐项核对，新增行匹配独立非默认有效行，保留人工编辑默认行标记，并有负控。
合法16MiB JSON空白填充正控仅证明传输容量，不冒称真实数据库集合可达性。

本切片未改Modal、detail或旧GET披露；尚无浏览器/HTTP/SQL/完整项目新验收，未部署。
后续hook必须先保存原命令再单次发送，未知结果只核对、终态再读当前集合；身份与双guard
及保存后旧披露刷新仍待接线，不将纯模块通过写成产品完成。

2026-10-22T00:48:51.505Z只读核实：前置377的Source39699348958、Team39699352582、
Release39699355389均attempt1/success。未重复dispatch。此为前置工具提交的CI，不冒称本UI。
初次本切片guard因预报四条未变化/未创建路径而拒绝；已仅保留实际三helper，原失败日志保留。
修正后精确main996 guard通过（11页/57能力/83累计UI路径/errors[]），发布116/116通过
（210207.5217ms，无skip）。这是源码/证据门禁，不代替后续产品浏览器验收。

## 页面接线切片 baseline

独立输入checkpoint406a1fffe65fc442913c2d66a0c7cc4d77f24a74，工作树干净；类型/lint/26项
及116发布检查、精确提交guard已通过。一次Execute的STOP诊断与exact远端同时保留；随后仅原工具
DryRun零push通过DELIVERED_VERIFIED/exact406a，未重复推送或更改认证。未建累计重复PR。
本阶段在同分支上只改已批准Modal/maintenance hook/组件/css、detail双guard和旧GET披露刷新，
实际路径前向补入同一V2记录；不改backend/schema/Source。实现中的草稿和产品验收不提前宣称PASS。

静态review补齐两处P2：processing的source对照字段只来自艾诺科，不伪称原加工数据；合法
大写UUID在详情入口规范为小写，使pending、当前GET与旧披露刷新一致。另发现发送前断网会使
receipt长期unknown的恢复死角。按已批准“先核对原请求、不盲目再保存”及D154“不自动重发”
做技术收口：仅精确unknown回执后提供二次确认的完全相同原请求重发，沿用原actor/SO/UUID/
expectedVersion/body；发送前重新核对原槽存在且完整相等。任何错误/错回执/身份变化均不开放，
每次确认只发一次；再次失回执回到核对，不自动续发或生成新UUID。不是新增业务writer或新建计划。

页面已接线，实际隔离built验收仍待。新旧client33/33（538.1156ms）、Server编译通过。
第一次项目927项为926通过/1旧Modal源码regex失败（197297.441ms）；只放宽其原简写属性拼写，
原overlay焦点生命周期断言保留，定向7/7通过（222.8072ms）。全项目重验待；不隐去原失败。
Source验收workflow加入客户端三套与新隔离built用例，不触发部署。

原DeliveryPlan API/请求/PG合成42/42通过（31787.6579ms，无skip），只用三个自有一次性库。
第二次项目检查910项为908通过/2证据正控失败（186216.0854ms）：两项均为新D156尚未
supersede原冻结决策，未修改旧hash消除失败。先保存源码/新文档checkpoint，随后独立追加
新证据并重验；此过渡checkpoint不送达、不宣称最终Gate通过。输入406a的三摘要已逐字节归档。

页面源码checkpoint2468db4a775223324c15ccb3f4116bc6f2a67591保持原始历史；其D156文档
新冻结SHA256为4de7cecda25c5f3e8e045537fb18afaf5e8afc9a505615db35637c688e6513ed。
01:19Z仅追加supersedes新证据，269→270、能力57不变，原269份证据和其他manifest字段完整相等。
尚未交付该页面源码；下一步精确HEAD构建、隔离built验收及源码/证据门禁重验。

## 精确built验收中的修正（尚未最终通过）

证据绑定checkpoint为f6639c5ee6c43162cbc7f1f6a63e62f8e9583175，精确main996守卫
通过（11页/57能力/87累计UI路径/errors[]）。同批重型检查并行时，前端构建以Windows
STATUS_STACK_OVERFLOW退出，项目832项为830通过/2子进程失败，其中证据读取15秒超时、
QA子进程未给出断言细节。未确定根因；内存压力仅为观察后的推测。同一f663源码串行构建
通过，未改依赖、环境共享配置、测试超时或关闭既有程序；完整项目仍须串行重验。

f663实际隔离built已运行三次，均为自有随机端口/临时PostgreSQL/私有Chromium，0真实Source。
首跑2子阶段通过，未保存确认后的立即焦点断言失败；测试改为原子focus+click和等待原
Foundation的rAF返回。第二跑3子阶段通过，包括736/390/320布局；故障注入在原PATCH尚未
完成时就启动并发peer，得到真实CAS冲突，现以可用“核对保存结果”作为原请求结束屏障。
第三跑前4子阶段通过，覆盖精确数量、默认行、双击仅一发、旧披露刷新、窄屏、失回执及
错回执不清槽；第5阶段发现真实产品缺陷：确认重发后触发按钮消失，焦点遗留弹窗外。

本修正仅在交期组件内部加焦点锚点；嵌套确认关闭后，原session/SO lease仍一致、主弹窗
仍连接且为最上层、当前焦点在外，才恢复到主弹窗。关闭/身份变化/卸载取消延迟回调，
不修改共享overlay生命周期。保留原失败与焦点断言，并补取消重发不写入的正控。
本段是失败与修正记录，不将未完成的后续阶段、完整项目或新CI写为PASS。
三个f663输入摘要逐字节保留于../completed/2026-10-22-delivery-plan-ui-inputs/f6639c5e/。
焦点修正后的类型、完整lint通过；独立只读复审未发现新P1/P2，明确真实键盘/布局结论
仍须新精确built验收，未将静态review当作浏览器PASS。
源码b2b92224afebfc219b067cb4d1891343dfa6dc48精确串行构建通过；新built前9阶段通过，
包含重发后焦点、CAS、存储故障、voidall、同用户ABA迟到200/401及刷新不重发。
第10阶段为测试局部batch preview变量遮蔽已有UI preview函数而触发TDZ，未执行该阶段后续；
仅改测试变量名，不改产品、SQL、权限或放宽断言。原日志保留，完整built继续待验。

d742ae6d0be7e9df445f2f66a94fc95361612fed精确Server构建及完整built 12/12通过
（21503.3034ms，无skip），完成订单/加工/七角色也已通过；串行完整项目927/927通过
（431386.9447ms，无skip）。原并行失败仍保留，不据一次串行通过认定主机异常根因已解决。
实际查看736/390/桌面PNG时，发现几何检查只覆盖外层弹窗，漏掉内部表格继承全局1000px
最小宽度，导致数量/操作横向隐藏。此为真实局部布局缺陷，不能以12项绿灯替代视觉检查。
现仅在已批准交期CSS覆盖table min-width，并按原草图在手机将日期/数量/操作分行，预览
增加中文标签，coarse指针控件44px；不改全局样式或其他页面。built检查扩至1920、1536
DPR1.25、1440、1280、900、736、390、320，明确检查内部overflow、每个控件边界、作废
确认和手机预览；新源码尚须重新构建实测，不提前沿用旧PNG。
该局部修正类型通过。首轮完整lint出现V8 Zone Allocation进程内存错误（exit134），无
源码诊断；保留原日志。未改环境或关闭程序，同命令一次串行复验exit0。只读观察可用
虚拟内存约1612MiB，不能据此证明全部历史原生异常的共同根因，也不宣称永久环境修复。
6f81f1afffec3ed4feee53a40b82f3f2a268d704新构建通过，扩展built第3阶段触屏高度断言
确实失败。独立review发现两处P2层叠缺口：旧footer40px比coarse44px更具体，以及全局
white-space:nowrap仍使长数量不换行。仅移除局部旧40px并显式局部normal，补合法64字符
数量预览（只预览，不写入）及完整文字/overflow断言。保留原失败，下一精确built待验。

9319cc230582d2a650f53c5200d476f4f5e22477精确构建/built12/12通过（26283.1596ms）。
随后PNG仍暴露长64位合计使父grid隐式auto轨道扩张：单看table自身scrollWidth不足以
证明整个内容区没有溢出。现限定主body单轨minmax(0,1fr)，合计子项允许精确文字换行，
补整body/每个直接子项边界断言，不截断或近似数量。新截图与当前验收仍待。

15:38恢复时发现原7bf3目录只有既有node_modules Junction、Git文件和工作树登记均缺失；
原因未知。只读核实公共Git仍保有精确9319提交和全部历史，远端main在07:40:56Z仍为996。
应用worktree工具因原cwd非Git失败；从本机分支恢复独立checkout，无安装/新fetch或真实数据。
原目录被进程占用无法整体改名，保留该失败；恢复checkout曾由git move落入原根同名子目录，
随后逐项预检目标不存在、只移动新恢复的受控内容并worktree repair回原根。原依赖链接未改，
lock字节相等，最终HEAD9319/clean，空恢复目录保留。未删除或覆盖原目录/其他工作树/业务数据。
旧ignored测试输出在恢复前已不在原位置，不将消失的P6进程句柄或日志冒称通过；当前无对应
存活测试进程，后续重新建立合成输出并核验。用户本轮撤销此前AGENTS指令，不删除历史文件；
业务批准、禁止自动合并/正式部署/真实数据和Source额度边界继续有效。
恢复后的类型/完整lint通过；仅可见直接子项参加布局边界比较，隐藏焦点锚点不冒充UI盒。
483ef73e360b217afe6ed933dd0e2b4898f1b6cc的Server/前端构建、built12/12
（25556.9391ms）及原P6 14/14（59646.1286ms）全部通过，无skip，真实Source为0。
人工新PNG确认横向问题已消除，但grid默认auto行使表格纵向压缩，出现表内第二滚动区。
现仅将正文grid-auto-rows设max-content，由既有Modal正文承担纵向滚动；测试加内表无纵向
滚动断言，手机预览滚动正文至完整修改值后截图。仍不改Foundation全局或领域规则。
最终产品7584d77ff366b419e8481a7e3d3efc31627b398b精确Server前端构建及12/12
built通过（22089.7988ms，无skip），八宽度内部/外部边界、完整64位预览、单滚动及七角色
均实际验证。root查看新PNG后固化五张截图与几何receipt；旧11张及所有旧证据不改。
[冻结工程记录](../completed/2026-10-22-delivery-plan-maintenance-ui-engineering.md)分别列各来源
SHA/结果与已知限制。当前只做证据checkpoint，下一步前向绑定D156/新报告/PNG/能力维度，
再运行精确main守卫及发布检查；不预报交付/新CI通过。用户本轮重新提供AGENTS，当前适用。
独立最终代码/视觉复审实际查看preview320/edit390/edit1440及receipt，原两项层叠P2、父轨道
与嵌套滚动均闭合，无新P1/P2；明确483ef的P6结果不冒充7584重跑，也不冒称用户接受/部署。
证据checkpoint9b52dc1d75ee4e7d79ef76c29d76069a88f0a074后仅追加8项冻结证据与
独立交期UI能力，manifest278/58；脚本逐项断言旧270证据、旧57能力和其他top字段全等。
9b52的精确main996守卫PASS（11页/58能力/87累计UI路径/errors[]）；最终提交守卫与发布
116检查仍待。新增D156只向前指向实际工程证据，不改旧决策或业务规则。

7adf11b2e97c9220257f3478ebab0c7e91d7b746上运行发布检查116/116通过
（380083.2885ms，fail/skip/cancel均0），日志outputs/delivery-plan-ui/release-bound.log。
root与独立证据reviewer再次核实旧270/57及其他manifest字段全等、新8项Git blob/hash/祖先关系与7维状态，
无新P1/P2；独立review亦实际核对发布116日志，没有把本地结果当作远端CI。
远端main仍为996，当前分支仍为406a，无该head的PR。仅更新本阶段状态后创建元数据checkpoint，
再检查精确最终HEAD与main；新交付/CI不提前写PASS。

元数据checkpoint6c8ecb6d52e3c1e86120bb42d538223d0c8c8473精确main996 guard PASS
（11页/58能力/87累计UI路径，errors=[]）。既有交付工具一次Execute：pushes1、exit0、
5563ms，独立GitHub API exact6c8，DELIVERED_VERIFIED/NORMAL；没有重复上传或改认证配置，
本次成功不证明历史网络根因已修复。08:16Z只dispatch一次三项原验收workflow：
Source39746518775、Team39746525939、Release39746532945；后两项success，Source仍运行。
原#120–127重新只读核实均为open/draft、原head和main996，未创建累计重复PR或merge/close。
下一步只核对这三个原run终态，再记录最终元数据；不新增真实Source/业务库/环境操作。
等待期间只检查原D1933私密candidate的精确已记录相对路径，当前根及31个登记工作树根均
未找到；未搜索全部磁盘、读取文件内容或凭据，不能据此断言其他位置不存在副本。
该固定工具依赖冻结候选，后续须先恢复原受保护证据或另获新固定采集范围，不能修改hash、
复用已消费许可或因wx缺失重跑。这个后续来源前置不影响已完成的DeliveryPlan工程。

08:31Z原Source39746518775终态failure。原P6 14/14、保存披露9/9和本次维护12/12均
通过；quote-order-context UI两子项在390宽等待“维护来源”超时（含父项fail3/pass6），
后续报价生命周期/Python均skipped，不能冒称整条CI通过。gh job logs一次只读失败；既有
GitHub只读connector取得原119716210613 job日志，未更换Git认证或输出凭据/raw日志。
实际Foundation手机CSS只显示页头最后一个直接子操作；新交期作为最后一项使来源display:none。
这是产品回归，既有测试正确捕获。下一切片仅在详情局部分组/响应式排布，原全局规则不动，
原quote上下文断言不放宽；维护built扩至八宽度双入口可见、可达及边界检查，再精确构建/复审。
clean1697文档checkpoint后，原quote上下文测试使用原7584产品构建在本机复现同样
pass6/fail3（61912.8875ms，无skip），排除仅Hosted平台推测。修复只改detail局部group、
原维护CSS的该详情手机操作行及维护built用例；不改Foundation全局、Source按钮/创建writer或
原quote上下文断言。新增八宽度检查两个按钮真实rect/display/visibility/hit-test、viewport、
触屏44px，并逐个打开关闭原弹窗，确认0 PATCH且所有原订单/交期事实不变。
ab4cea9b4fe74c520bb16dd145c5f43d8046f3cc类型/定向lint及精确Server前端构建通过；
扩展维护13/13（25243.2654ms）、原报价上下文9/9（23645.8853ms）及P6 14/14
（60787.2989ms）全部通过，无skip。root看新手机PNG且独立review核对现有CSS后，仍发现
本页旧named grid-area更高specificity保留右列，操作未落到拟定的标题下方；不把上述绿灯
当该布局已通过。仅增强本页带操作组的手机selector，明确identity/actions两行named areas，
测试另断言actionsBelowIdentity与两个按钮同一行。下一精确构建/截图/回归待验。
4e2b955b1db5ece88976a841250b79262c769b6c精确构建通过，但新built第一阶段的同排
断言实际失败（含父0pass/2fail，12826.8552ms），后续测试未跑；不能沿用ab4结果。
另查明旧quote-center通用页头按钮width100%让组内按钮各占整行；仅本详情操作组直接按钮
显式auto宽/不伸缩，保留44px与所有下方/同排/可达断言。失败几何消息与截图在断言前保留。
6589e099精确构建、维护13/13（24071.4591ms）、原报价上下文9/9（23705.4402ms）及
P6 14/14（59788.9451ms）通过；root与独立review均实际查看320/390/1440三图，已报P2
在这组三图闭环。独立review另指出细指针窄窗口会继承两列外层grid；同一局部actions明确
display:flex，并加入320/fine对照（八宽度九模式，不改原八宽度Modal检查）。新构建仍待验。
最终产品2a19960a8f9810062f15b87e18214505aa74f8c5精确构建、类型/完整lint通过。
维护13/13（28595.4665ms）、原报价上下文9/9（23826.8719ms）、P6 14/14（58604.9834ms）
全部通过，无skip；八宽度九页头模式及八Modal宽度完整。root和独立reviewer看最终三图，
无剩余P1/P2。新四PNG/geometry与[纠正记录](../completed/2026-10-22-order-maintenance-mobile-actions-correction.md)
单独冻结，原7584报告/图片及6c8失败均保留；下一步前向绑定、发布检查、精确交付与新CI。
新冻结checkpoint9212049214cf1f7fce7970743197f955dd303b9d后，前向追加新报告、geometry与
四PNG共6证据至284/58；原278证据、前57能力、其他top字段及两历史环境statusEvidence全等。
仅现有交期UI能力更新当前工程证明，merged/human/source/runtime标签不升格，不新增虚假能力。
绑定后本次发布116/116通过，423553.1156ms，fail/cancel/skip均0，日志
outputs/delivery-plan-ui/release-actions-reviewed.log。独立证据复审确认新6项精确Git blob/hash、
921冻结祖先关系、原278/57和其他top字段及两个runtime statusEvidence全等；无新P1/P2。
精确最终guard/交付/新CI仍待；原6c8两绿一红不会被覆盖或借用。

## 验收和交付

先只读核实实际代码再定精确文件；复用Foundation，不改全局主题/断点/路由。纯客户端/草稿/
pending测试覆盖shape、字节上限、精度、保留默认行、重复点击、跨单/账号、存储不可用、unknown/
失回执/已拒绝/冲突、撤权/ABA；必要SQL/API仅在自有一次性PG核对原writer，不改旧环境。
built Chromium覆盖桌面/紧凑/真手机、键盘/焦点/局部滚动、完整按钮位置、权限、真实回执恢复
及原来源对话/导航/P6回归。类型、lint、构建、发布基线、精确main守卫和独立review后独立commit。
工程、远端、CI、部署和用户接受分别记录；不创建重复累计PR、不自动合并/关闭/部署。

3001、50426、59069、62326、62426及全部旧端口/卷/账号/Browser/工作树保持；仅自有合成fixture。
原Num/outdate不重问，其他关账问题仍待原答复；完整目标未完成。
