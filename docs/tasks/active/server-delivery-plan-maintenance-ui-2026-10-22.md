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

## 验收和交付

先只读核实实际代码再定精确文件；复用Foundation，不改全局主题/断点/路由。纯客户端/草稿/
pending测试覆盖shape、字节上限、精度、保留默认行、重复点击、跨单/账号、存储不可用、unknown/
失回执/已拒绝/冲突、撤权/ABA；必要SQL/API仅在自有一次性PG核对原writer，不改旧环境。
built Chromium覆盖桌面/紧凑/真手机、键盘/焦点/局部滚动、完整按钮位置、权限、真实回执恢复
及原来源对话/导航/P6回归。类型、lint、构建、发布基线、精确main守卫和独立review后独立commit。
工程、远端、CI、部署和用户接受分别记录；不创建重复累计PR、不自动合并/关闭/部署。

3001、50426、59069、62326、62426及全部旧端口/卷/账号/Browser/工作树保持；仅自有合成fixture。
原Num/outdate不重问，其他关账问题仍待原答复；完整Goal active。
