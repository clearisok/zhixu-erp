# Gate8E1：Server关账浏览器契约冻结工程证明

2026-10-27。branch codex/server-closing-browser-protocol-main-869e，clean阶段基点e5f4d2350e545628761bf6da7f41245f9d49b43c。main869ee84dd0b31de6161011e4aa560678b244a64d沿用同日已核实证据，无fetch/重复API；PR130旧head61704afe22fe9fd0ea9f6625c6092fcbb9575dfc不代表本阶段。Git/ref写STOP_AUTH_OR_DIVERGENCE根因UNRESOLVED。

## 实现与业务边界

D167复用Server唯一parseClosingIntent/Command和原分页规则，去除间接PG/Node运行时，保留UUID及Buffer等价Unicode语义。金额计算仍只在Server，浏览器不另建关账、价格、税或汇率规则。手工月份/数量/颜色/执行方、显式期间税率、CNY成衣销售、USD经销工价和独立USD加工服务沿用D162/D163。无税率更正命令/默认13%/自动收入或自动分月。

原回执复验不可变command/request/hash，返回最小commandHash证明；不同actor同UUID隔离，不公开原命令或金额。历史即使空页仍绑定entityType/entityId，时间ISO，旧身份/版本不重写。client严格验证basis/期间/明细/历史/预览/结果，fresh owner lease、同源session/no-store、1MiB；金额可见性按销售/工价分开，未知字段、错原语/CAS/hash/对象/页码和受限金额拒绝，无自动POST重试。

sessionStorage临时键只存当前actor/tab一条规范原命令和元数据，不含价格/CCT/成本/原响应/凭据；损坏/未来版本和另一未决原字节不覆盖。低层submit尚无保存→POST编排；fixture手工组合save/POST/receipt/ack不等于实际页面controller。没有DOM/React/session-provider/导航或可体验声明；关账UI和原USD采用UI具体批准pending。V0三helper路径登记仅引用既有order-detail保护范围，不声明新关账页面基线或order-detail实际调用链。

## 分源验证，保留真实失败

- S1 48a41fb6957c7353415e690863af48ec704c9a2e：owned Git archive逐一核对3072 tracked blob、0overlay，junction复用既有node_modules，无安装。82/82受影响（16basis模型＋15contract＋9basis HTTP＋14commands HTTP＋7integrity＋15client＋6新HTTP含父项）与811/811项目通过；lint、Server build、前端package build通过。root typecheck三处失败（预览意图类型收窄、两处测试amount可空），canonical.passed=false原件保留，不能称该轮全PASS。Vite8浏览器编译3输出/10模块，无Node/PG运行时。
- S2 45a5b087b4b3ed19ae448188257146a516d75bf4：实际直接父为S1；只改closing-projection.ts一处显式return类型收窄和closing-interface.integration.test.ts的金额断言/状态流验收。新全3072blob/0overlay archive，38/38（15contract＋15client＋8新HTTP含父项）、root typecheck、相关lint及Vite8浏览器编译通过（3输出/10模块）。应用Server、SQL、package与S1不变；811项目和前后端build复用S1，未重跑，不相加为120，也不冒称S2重跑82或811。
- actual API→PG验收只用新owned tmpfs合成PostgreSQL：创建期间/归属、更新/复核/作废、确认/取消确认/锁定/带原因重开原九类命令；手工量/税率、独立CNY/USD桶、加工0USD、旧锁定manifest及快照、历史版本/分页/ISO、fresh金额权限撤回、不同actor回执隔离。真实COMMIT后合成丢POST回执，GET原hash核对并保留未决，不自动重发。
- 独立只读复审两项P2已闭合并有真实projection负控：basis联合上界需容纳1000当前＋1000历史残留；重复歧义颜色只作为所有可见渠道均blocked的诊断，不能变为eligible。1MiB不放宽。最终源码/两轮QA复审0剩余P1/P2，审查者未运行测试。
- source-corrected.json.parent仍记录阶段基点e5f，不是S2的直接父；原件保留，派生lineage.json分别记录phaseBase、S1 actualParent=e5f、S2 actualParent=48a。此为元数据说明，两个归档和日志的源码归属不变。
- 本阶段未重跑144发布负控、没有Hosted CI；旧144只归其原源码，实际新PR交付前必要完整门禁仍须完成。最终精确main守卫在后续收口完整HEAD运行一次，结果另记，不预报。

## 保护与状态

274条旧本地branch HEAD逐项相同；50容器/179卷/27网络选定标识前后相同，只是标识核对而非内容或完整状态审计。新owned库按夹具回收，无既有库/账号、Browser存储、旧环境/卷/备份操作。0远端写/Hosted/真实Source/绑定/激活/调度/合并/部署/切换/退役。仅扩展原closing测试命令，无新workflow/job。68能力不改；协议验收不等于实际用户验收、远端送达或完整Goal完成。

## 本机原件SHA256

目录outputs/server-closing-browser-protocol-20261027，原件不覆盖；QA archive路径与归档hash保留在prepared两份原件。

- start.json：7cf0fdd766a94593d9ec1907efc03ec5502ab7b1d55e91f67722ca9fffb91976
- source.json：81a23a7f3926d62fb887e35145ae58b2953c57e34bb4d06c5f19fe6717ebdae7
- prepared.json：ece417d27963ea53a21a6b88fb827af35aa38103645a1a4515ab6bd403e4dcb1
- canonical.json：ab5fc58cb49a8872f25f6a0f9ada544455dc6a225902776433da8fc0d346cdc1
- canonical-typecheck.log：2f5a14328510cee3e48f6d7f64500bed140f91b732eefb90fe38e8960bfd180f
- canonical-affected.log：8df985e627b6fb95385afa897f4e67a9de99e151b85c2c94a1503e901addbd8c
- canonical-project-tests.log：57577adb5e2f9e4e627bbb12ec0cd1bd4e2c2348128984398dea83e951b0f279
- canonical-server-build.log：169f24774e13a79b6341d6c41c58f159e180701e87e9028aa70afdf8712b6fbb
- canonical-frontend-build.log：59311504d014bdabaa371e7e3018724404a33c3fc5072fda855acad08c67173b
- prepared-corrected.json：3ff26afb767518d8d384e7d808667be24b21f119f3d0b2a81560b45b98e9b990
- corrected.json：a4b74bfb27c3d1331ddbb9b072bcd7343f186305950339ef0166be2671d8147b
- corrected-affected.log：fcc7c0d957f51c3684172808e184e4b71a72f5940b6c62422075f87f89799c22
- browser-bundle-corrected.json：db20198e71e89233243734be28072cd4a9db061cde710e4c9d77a09458ca6556
- preservation.json：9b4d42f51fb7f5a104fcc3c0f0e67883c2bfc52ed087cd6c3b241b630ae9f7c9
- preservation-corrected.json：de392cc67095f51023b5e081c7d66197abe4a8ebd670a8a60e0e99558a08164e
- lineage.json：4bc2ec14effd501238fca8233f49a68064055d9d4810c487f53a3b6d0e298d83
- ref-preservation.json：d6aa0abcb2270bb81ffe1cf7cf86f91d2b24da79c130614b06f1248655218bff
- review.json：1fd7b29d9bcca5d1a6a7cef925ec861e7d63a77057e54590e8309b57a6138fc2

[当前契约](../../features/SERVER_CLOSING_INTERFACE.md)；[阶段](../active/server-closing-browser-protocol-2026-10-27.md)；[待批准UI](../active/server-closing-ui-proposal-2026-10-27.md)。本页固定本切片，后续用新证明前向接续，不覆盖旧冻结证据。
