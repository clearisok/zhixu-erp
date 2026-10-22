# Server 成衣出货观察

## 范围与状态

D-147 Gate7A/7C / D-152 / D-153。本模块保存6086979指定查询的不可变观察，关联已接纳的可信合同SO和既有稳定颜色；不是跨次出货事件账、生产完成、收入或关账。内部模型/DB读取及原订单详情只读接线已本地合成验收；真实精确合同过滤、行身份跨次稳定、取消/冲销和正式收集器仍未验证或交付。本轮没有新增真实请求、绑定、激活、调度、真实库升级、部署或用户人工接受。

## 数据所有权

- Quote/CCT/订单商业版本继续拥有价格；生产执行继续拥有实际完成。这里不读写这些金额或数量。
- `ainuoke_garment_shipment_targets`：每订单独立opt-in，默认disabled；来源指纹、明确时效策略、独立过滤核验证据及版本。没有默认时效、自动建target或激活HTTP。
- `ainuoke_garment_shipment_snapshots`：内部发布的完整输入、精确原上下文、原物理来源SO/link/有效归属/订单版本、颜色依据、可重建投影、不可变内容hash和逐代版本。
- `ainuoke_garment_shipment_color_matches`：每笔观察的冻结颜色匹配；复合FK保证颜色属于同一订单。未知/缺失/重名不伪造颜色或执行方。
- `ainuoke_garment_shipment_heads`：逐目标CAS，只有整代快照、全部颜色映射及审计一起成功才前进。原始快照和映射不可修改或删除。
- 所有SO、来源SO和子映射引用同时进入既有归一盘点；部分schema fail closed。归一仍无生产/财务全量覆盖，不能据此移动执行记录。

0040只新增空表/函数/约束；旧迁移不重写，无旧业务回填或Browser迁移。合成0039非空升级检查所有原public表逐行字节不变，正常运行仍verify-only。

## 来源输入与口径

离线Python `garment_shipment_observations.py` 不做IO。它校验原始响应SHA256、重复JSON键、报表/页号/页大小、精确查询声明和返回合同，保留原数字lexeme为字符串；固定contains/D1933首页诊断不能冒充该契约。查询声明与返回行一致不等于已证明上游真实执行精确过滤，真实启用前必须另行核验。

原始响应同时给出`dataCount`与`dataList.total`时，二者都须通过原严格count解析且相等；显式null、布尔或非法次要总数不能被优先字段掩盖。仅给出一个合法总数仍按既有契约读取。该前向校验不重写旧快照、不放宽页号/页数证明；[Gate7D](../tasks/active/server-convergence-gate7d-capture-integrity-2026-10-22.md)保留实际复现与验收。

Node `garment-shipment-observations.ts` 只接内部checked pages，不能由HTTP调用者提交投影、权限或绑定。工程上限为每遍20页/2000行、每页100行、两遍总输入16MiB、捕获时间窗180秒；不是新增真实采集许可或调度预算。完整页数/行数/账号/合同/页序、两遍所有行内容、捕获身份和时序逐项校验。

行id只在捕获内查重，跨快照不作为已证明的业务事件ID；同id重复（即使值相同）拒绝，不静默去重；合法不同id相同业务值保留。两遍可返回不同顺序，但内容集合必须一致。零行保存“本次指定范围观察为空”，不是取消、未出货事实或自动清零；旧快照仍可查。不同观察从不累加成总账。

- Num为本笔数量，精确十进制保存，零、负数、缺失、无效分开；负值不擅自命名为冲销，不将缺项剔除后声称合计完整。
- outdate为业务日期，只解析已支持的合法date-only格式；无值/非法值不回退FDate、indate、交期或今天。
- FDate、indate、DeliveryDate及styleNum/ycyNum/UsableNum各自保留，不参与替代计算；本阶段不输出数量合计。
- billno为出运单据号，ExpContractNo才用于可信合同精确核对；款号不是SO身份。
- wxprice、备注、联系人等不进入普通DTO、日志摘要或搜索。checked input可保留源字段作为内部证据，不能把内部JSON整体返回客户端。

## 颜色及并发边界

复用 `readStableOrderColors` / `stableOrderColorId`。数量、交期和原行内容hash不构成颜色身份。当前颜色唯一时按既有businessKey匹配；改名/消失为unmatched，重名为ambiguous，缺源颜色为missing_source_color。匹配依据随观察冻结；后来镜像变化只返回`colorBasisChanged`，不重写历史关联。首次发布需要时仅注册已有真实颜色的稳定身份，不制造新业务颜色。

写锁顺序：effective fence → 当前user/role/grant → 单目标发布锁 → Source profile/target → 排序后的全部物理SO成员 → 可信来源与颜色 → CAS/快照/子映射/head/原审计。prepare为只读权限和范围预览，不锁只读事务；实际发布重新鉴权及冻结。原来源SO与当前有效SO不相同也冻结完整物理组。

`publication_context`和输入原样形成精确回执依据。重复捕获先核对已保存的原输入/上下文和当前访问权限/可信绑定，返回原publication及generation；即使捕获已过180秒或head前进也不再创建。只有全新发布才检查当前完整范围及捕获时效。COMMIT回执丢失不代表事务失败，不自动采集或重发。

写前同时校验紧凑JSON和PostgreSQL `jsonb::text`实际字节：input/payload各16MiB，颜色依据512KiB，scope/context各8KiB。超限明确422，身份、快照、head和审计全不落地，不截断。

## API及配置

显式 `ZHIXU_AINUOKE_GARMENT_SHIPMENT_READ=snapshot` 加合法 `ZHIXU_AINUOKE_SOURCE_KEY`，且仅session authority；默认disabled，与物料/财务开关互不推导。没有新增页面route或公开写入口。

- GET `/api/v1/sales-orders/:id/garment-shipments`：当前DB快照。
- GET `/api/v1/sales-orders/:id/garment-shipments/history?beforeGeneration=N`：每页25摘要；只查询不可变标量列，不读取input/payload/颜色整包，打开详情时才重建验证。
- GET `/api/v1/sales-orders/:id/garment-shipments/:publicationId`：该订单原快照的验证详情。

所有读取重新核实启用且未归档用户的`order.view`和`ainuoke.view`；内部发布还需`ainuoke.sync`，不借用物料导入权限。GET只读DB，no-store，无外部HTTP、凭据、Browser回退或自动刷新采集。加工业务经真实批次验证后返回not_applicable，伪业务类型标签不能冒充可信订单。旧alias不自动跳转读取另一张SO的历史。

观察时效由target明确策略标注fresh/stale，过期历史仍可读；原target版本变化显示targetPolicyChanged。读取DTO另给出`expiresAt = observedFrom + 原快照freshness_ms`，当前target改策略不延长旧快照。账号/profile/可信归属变化不会把旧观察重新认作新范围的当前数据。历史摘要是不可变索引，详情才是完整内容重建；不把摘要标成已验证全包。历史游标覆盖PostgreSQL正INT完整范围，不只接受九位数。

### Gate7C只读契约与客户端

`features/ainuoke-garment-shipments/model.ts`复用原数量/日期纯投影，旧server导出继续兼容；没有Browser或财务公式。`client.ts`只请求以上同源GET，独立校验17个公开字段、固定报表/合同/订单/所选publication、两遍trace与行投影，拒绝额外金额/备注。客户端校验不是来源过滤、授权或密码学证明。公开payload工程上限16MiB之外仅另留64KiB读取元信息；历史摘要64KiB，流式累计超限即取消，不截断。

单调时钟扣除请求耗时，保留到期及空观察；原策略不被付款十分钟或当前target替代。每次请求必须提供当前owner lease，切单/会话/关闭/取消后不消费迟到正文或401；页面使用layout owner/epoch并在权限失效时隐藏旧内容。无自动重试、存储、Source调用或变更命令。历史空页可以仍有游标，按游标继续；摘要与精确publication详情分开，详情失效不回退另一快照。第一切片1630模型/客户端与后续4066页面分别验收，不把工程接线当作既有体验环境已升级。

第二切片的`garment-shipment-section.tsx`接在原正式订单详情，复用Foundation Card/DataTable/移动记录/Drawer，默认收起；只显示Num/outdate、原日期、原单位和冻结颜色，无总量或金额操作。`use-garment-shipments.ts`采用实际session对象和layout epoch/序列/开关/所选publication的owner；到期仅本地改标签，不发请求。打开历史先用本地GET重核当前绑定，当前与历史模型独立；撤权/来源失效清整个区块并要求显式重新读取，不影响订单详情其他区块。最终4066/build20261022-022801的13项出货built及14项原P6回归通过，六宽度和七个合成角色已核对；[冻结报告](../tasks/completed/2026-10-22-garment-shipment-read-ui-engineering.md)保留范围/失败顺序/四图。403注入验证UI清理，后端权限回归另列；既有环境不升级，fixture仅自有一次性PG/私有Chromium。

## 验证与剩余工作

### Gate7B：固定合同过滤核验工具（未执行真实查询）

`garment-contract-verification.ts` / Python `garment_contract_verification.py` 只作独立诊断。CLI只能接收私密候选、凭据、输出目录路径和固定动作，不接受合同、报表、页号或替换hash。先探测Node数字原文能力、clean commit与私密输出，再核对已冻结D1933候选的包装hash、内部原文hash、原工具提交、唯一非空合同/账号指纹及id/billno见证，之后才读取凭据。旧候选的历史日期不冒充新捕获时效；合成选择解析函数不构成真实范围授权。

固定队列为C1首页 → 虚拟合同C0首页 → C1首页，条件为6086979 / ExpContractNo / is / [内层]。该查询条件仍是待实测假设；不会在失败后改字段、改比较器、去除条件或翻页。最多1次登录+3次报表、每报表4MiB、报表累计12MiB、登录另4MiB、整链180秒，无重试。首页total>100即停止；正向非空、全行精确合同、双总数一致、id唯一/见证存在，两遍内容集合一致；C0必须成功且明确total=0/rows=[]。行序变化允许，数量精度不经浮点改写。

复用Python严格无损JSON与有界传输、Node精确数值解析、已有私密文件ACL/hash检查和不可覆盖报告写入。Python端任何失败停止，安全已收页面可私密保留；含秘密反射、重复键或无法安全解析的文本不落地。Node独立复核原文hash、完整范围、时间、顺序与两遍内容；超时/损坏进程回执标记次数未知，不补零。公共回执只含别名、数量、hash和静态原因。普通“[待核]”等业务文字保持文本，真正编码JSON继续检查重复键及秘密字段。

Windows入口 `scripts/ainuoke-garment-contract-verification.ps1` 只创建新的受保护ignored目录并启动原Node入口，不在PowerShell读取或显示密码。最初准备/测试只用合成临时文件；2026-10-22获准的一次工具调用在candidate本地校验失败，0 HTTP/0报表、未进入凭据阶段，失败即停。仅离线读取已授权冻结候选后，查明合法编码配置的对象深度13/组合19超过原通用检查限制；[修复任务](../tasks/active/garment-filter-metadata-screening-2026-10-22.md)保留原失败与哈希核验。固定工具现逐层复用原秘密键/反射规则，并以统一组合深度64检查对象、数组和编码JSON；超深及解析资源异常用固定错误码拒绝，普通括号文字仍保持文本。此局部修复不改变通用Source/付款模块、冻结hash、条件或请求预算。

离线候选解析通过不等于真实过滤已核验。诊断不注册Catalog、不激活target、不访问DB、不产出可发布快照或默认新鲜度，也不证明所有合同过滤、跨次事件身份、取消或关账；没有自动第二次真实调用。原工具工程/交付历史见[Gate7B任务](../tasks/active/server-convergence-gate7b-filter-verification-2026-10-22.md)。

`npm run test:garment-shipment-observations`执行纯契约、一次性PG/真实session HTTP、0039升级、并发撤权/停用/物理来源更新、丢回执、过期重放、历史分页、跨单颜色FK、容量及审计回滚。Python全套含原文精度/hash检查。新增命令接入既有Source验收workflow；本地PASS不代表Hosted CI。

真实启用前仍须有具体受控查询授权，核实精确合同过滤、分页和两遍范围，不能重复使用D1933已消耗额度。正式收集器/操作者命令、来源失败记录、后续采集操作UI、取消/冲销/事件身份及财务采用分别交付；本轮订单只读展示不代表这些后续能力完成，不从一次样本或本快照模型推断业务闭环。完整Goal继续。
