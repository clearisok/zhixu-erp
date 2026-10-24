# 当前Server成衣出货观察后台工程证据

2026-10-24；source `d1930a2da590098f70e6433892eab350a3262e0c`，tree `6f4224432dfb373ee53c302e22bc793fda8c6132`，main比较 `e01a11952b648024c0bd6bf4259de429374981e2`。本地离线/合成工程，不是成衣事件台账、真实采集激活、收入或关账，不表示合并、部署或用户接受。

## 输入、业务口径和数据owner

从clean5f3dc11df3270fceef14227c0a005220bd570145接续；412594 prep保护原三摘要/hash与完整前阶段回执。原49bb0d→b652的16非文档路径，13输入精确、workflow/package/README只追加；新source共23路径。保留旧0034–0039、容量与Source锁序，不整体导入旧分支、manifest、UI或0041–0043。

两处已有P2窄修复：a2967558仅两Python文件，双总数同时存在必须相等并严格有效，单字段兼容保持；1630c19d只取HTTP历史游标正则和2147483647/2147483648两个断言，不带UI/模型/expiresAt。没有本轮先验红测试声明；相关负向检查在当前冻结source实际执行。

D147/D152/D153：6086979 Num为本笔成衣出库数量、outdate为业务日期。FDate/indate/DeliveryDate/累计列分别保留，零/负/缺失/非法不混同，不借日期或默认币种填空。billno出运单据与销售合同/正式SO分开；物料出运不代替成衣出货。Quote/CCT/订单商业版本仍拥有价格、production execution拥有完成；本模块不写这些owner或关账。

0040默认新增四空表：显式独立关闭target、不可变输入/精确发布上下文与快照、冻结颜色匹配复合FK、逐target CAS head。复用可信合同、有效归属及完整物理SO；稳定颜色不依数量/交期漂移，缺失/重名/改名不猜。每捕获行id查重，不把跨次id当事件键；两遍内容一致不代表上游事务，空结果/消失不是取消或清零，不跨版本相加。

离线Python只校验原始文本/hash与分页/报表/合同，Node只接内部checked pages；工程20页/2000行/16MiB/180秒不是新真实请求额度。需要另证真实合同筛选与正式collector，本阶段无外部HTTP或凭据文件读取。

fresh actor/grants和effective fence→target advisory→profile/target→完整物理SO锁→绑定/颜色→CAS/快照/映射/head/审计；原捕获回执先核原上下文/输入与当前访问，不受新捕获180秒限制。写前同时校验紧凑JSON及实际PG jsonb::text容量，超限422且无身份或业务残留。可确认提交前错误回滚；COMMIT响应丢失须核对原捕获，catch执行ROLLBACK不证明未提交。

DB-only GET当前、25条锚定历史摘要和指定publication详情，默认独立disabled、显式snapshot+sourceKey+session；无公开writer/激活、Browser回退或GET采集。历史只读标量列，打开详情才重建完整证据；普通DTO/摘要不输出wxprice/备注/联系人。所有读取fresh order.view+ainuoke.view，内部publish再需ainuoke.sync；加工可信批次不适用，伪标签不能绕过身份。

## 实际验收

canonical archive SHA256 `58adb7b1db317c04e758ca9deb8f9a710ecbbf5e0bb9a8e5b18e538ff1799e36`；沿用现有node_modules junction，无安装；全部账号/合同/订单/颜色/来源和PG均为新建合成一次性夹具，未触及任何现有目标。

| 检查 | 结果 | 进程耗时 |
| --- | --- | --- |
| typecheck | PASS | 40068ms |
| server-compile | PASS | 21205ms |
| compiled-app-load | PASS | 2807ms |
| lint | PASS | 57686ms |
| root-nonrelease | 811/811 | 27921ms |
| garment-source-and-regression-api | 173/174 | 150909ms |
| Python全套离线 | 139/139 | 6961ms |

19文件API共174项，173通过、0失败/取消、1既有Windows平台SKIP（含父节点计数）；根811及Python139无失败/跳过。原Linux CLI文件权限/只读check用例在ainuoke-server-source.integration.test.ts:277显式win32跳过，本轮guard与cli.ts字节不改，未称PASS或安装Linux环境。必要后续Linux CI仍保留，不借其他通过覆盖缺口。

实际覆盖新纯契约、两页精度与未知值、scope/page/rows/two-pass不一致、原始数字lexeme/hash/重复JSON键和双总数；独立开关/真实session/POST与selector拒绝、金额与备注不泄露、颜色数变/重名/改名和跨物理SO FK、CAS双操作者、原捕获重放与过期后回执、空观察不抹历史、25条分页及跨单详情拒绝、target/profile/账号变化、fresh撤权/停用等待锁、完整物理归属冻结和归一引用。容量实测合法大捕获只读标量历史，超PG实际字节拒绝无残留；审计失败与SQL不可变/代际/归属约束保护原状态。测试模拟真实COMMIT后确认响应丢失并核原回执，不生成第二版。

0039非空合成升级（可信SO和Source非空；未预置人工计划，不能冒称非空到料计划恢复）逐行保护所有原public表，缺失/部分schema失败关闭；0040新表均空、不seed权限/业务/目标、重复migration幂等、启动verify-only。相关boundOrders调用链、绑定/固定Source/代际、有效归属、归一盘点、fresh start与0039升级实际回归；未来0041/43未带入。

## 前端复用与交付限制

app/components/features/public/worker和Vite配置/锁文件均未变；原a0c3 Server产物215文件逐一SHA256相同，仅供API构造。原物料界面双构建/48浏览器结果按未变范围复用，本阶段新Vite=0/浏览器=0/截图=0，不称新像素验收或用户接受。未变商业/生产完整套件不重复，不计入本轮API。

source独立只读review无新增P1/P2；审阅者未代跑测试或网络。发布134与精确main守卫按后置实际回执核实，此证明不提前写PASS。根811与发布134为分阶段联合945，不是一轮执行。清单只追加当前证明、feature和D152/153决策链及独立能力，原387证据/56能力/runtime/21routes保留。

继承NETWORK_DEGRADED，push0/PR0/Actions0，不逐Gate重复失败通道、不借#125 CI。无真实Source/凭据/账号/业务DB/现有卷、绑定/激活/调度、自动merge/close/deploy、50426切换或退役；保护3001/50426/59069/62426、Browser和备份/结果。Goal active；后续0041刷新、出货UI/交期0042/collector0043及关账三问独立，不默认业务决定。
