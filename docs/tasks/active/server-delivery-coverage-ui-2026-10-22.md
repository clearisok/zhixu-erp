# 当前登记事实交期覆盖：客户端与展示接线

2026-10-22；root唯一writer，独立reviewer只读。main再次通过GitHub核实为
`996dfedc12da3527343cd3ff2aa5eea35497e10e`；开放草稿#120–127均保持原head。
从main新建`feat/server-delivery-coverage-client`，仅FF干净已交付输入
`c5b4bec40097606142c69ecc2517de82a4c07370`；未继承dirty、未重置其他分支或工作树。
上一Goal轮次是progress：交期维护实际修改、精确交付及2f0的三新CI均通过。

## 已核实缺口和本切片

D155后台原GET已返回`production-delivery-coverage.v1`；原客户端忽略该字段，
原生产订单抽屉没有交期覆盖。依据已批准累计需求/生产供给规则，不新增金额或关账口径。

先完成V0客户端接线：

- 在原1MiB逻辑响应的session GET、lease与白名单内保留coverage，既有4KiB传输封套余量
  不变；不建新API、repository或缓存。
- 缺失/null表示服务未提供；不由Browser或客户端计算替代值，不冒充零缺口。
- 已提供对象严格检查schema/basis、日期、精确十进制及有界数组；用同响应计划/执行事实和
  原`projectDeliveryCoverage`纯函数验证一致性，只保留白名单。没有第二套风险公式。
- 取消产出、结束余量、多期累计/无日期、原物理SO、别名及零/未知继续D151/D155规则。
- 现有页面不读取该字段，本V0不改变DOM、样式、导航、权限或按钮。

随后提供沿用现有订单排单抽屉的具体展示草图，V2展示在用户确认后实施。
依据RELEASE_BASELINE_GUARD“V2/V3 need concrete wireframe/comparison approval before
implementation”，交期维护的原批准不扩张为新风险面板批准。
UI待批准不阻止本只读客户端的测试、独立复审和checkpoint。

## 检查与安全边界

待实际执行：定向单元、原客户端回归、原API/PG覆盖、typecheck/lint/Server与前端构建，
必要生产排单built回归、发布116/精确main guard及独立review。没有预报PASS。
真实Source、凭据、旧业务库/账号、3001/50426及其他端口/卷/Browser均不读取或修改。
无自动merge/close/部署/入口切换，不创建重复累计业务PR。关账原问题不默认、不重复询问。

原c5b最终元数据上传返回STOP拒绝分类且独立API已精确c5b；后续原工具只读Dry Run
pushes0为DELIVERED_VERIFIED，Git读通道也精确c5b。原非零回执不改写成exit0，
不重复上传、不推断拒绝分类原因或长期网络恢复。新工程不依赖真实Source缺失候选。

## 源码checkpoint前的首轮结果与冻结草图

新coverage客户端/原读取/原命令合计54/54，1487.0117ms；原D155纯投影和真实PG/API15/15，
11331.9875ms；typecheck与完整lint通过，无fail/cancel/skip。真实HTTP现在验证客户端保留
可信coverage，不再断言“丢弃新字段”；旧缺失/null payload另有兼容负测。独立静态复审无P1/P2，
仅容量措辞按建议改为1MiB逻辑响应+既有4KiB封套余量；未把reviewer未执行的检查说成已跑。
Node/前端构建、原排单built、发布、远端和新CI尚未执行，不借前阶段结果。

交互草图只使用合成数据，在独立私有Chromium验证736/390/320三宽×五状态15项，
没有脚本异常或横向溢出，0真实Source/业务库请求。首次原型检查器未进入sandbox子frame而失败；
修正仅检查器的独立iframe session附着后通过，不是系统产品测试或用户接受。
原型位于`../assets/server-delivery-coverage-proposal-2026-10-22-v1/`，冻结后不覆盖：

| 文件 | SHA256 |
|---|---|
| delivery-coverage-review.html | efaf55aac9a947d698fade85bec0c7e74ef624000f7a0a947b356cb1e1ef3a6e |
| desktop-736.png | 8deb6da6dc58549fc293ba623a176a8eaab69f43aa17cc16df06408c52e4751e |
| mobile-320.png | 549b35dde1366dda3d9e758abe53cbd02d89de66765d7a4356f5c4e525fdf1ad |
| prototype-receipt.json | 082dca0574f1302e6d314ece2883c8e24111a42722c570df1c8a298b43452f75 |

建议位置是原订单排单抽屉、物料与运输上方；保留原操作，仅追加只读覆盖、按期累计对照、
未定交期与显式重新读取。移动端同一数据按记录折行，不出现“历史准时率/实际可出库”承诺。
具体草图批准仍待用户；原维护交期批准不复用。

## 源码483be024的本地收口

产品源码`483be024031699af8d8e19fa67a4bedc85e21740`的Node编译与显式Server前端构建通过；
实际build-info为`server-delivery-coverage-client-483be024-20261022`，gitCommit精确483，
buildTime为2026-10-22T22:13:41.5387825+08:00，quote/master authority均Server、session、
writable、order snapshot。没有新镜像、旧体验环境更新或部署。

原生产排单production-built Chromium回归37/37，79299.1902ms，无fail/cancel/skip；
覆盖既有队列/排单/执行/物流、权限、CAS、未知回执、A-B-A会话及桌面/DPR/手机几何。
这证明原可见页面未回归，不是待批准覆盖面板的系统验收。
发布基线单测116/116，365977.5741ms，无fail/cancel/skip。
日志分别为`outputs/delivery-coverage-client/{server-build,frontend-build,production-ui,release}-483be024.log`。

精确main源码门禁首次在483失败：`UI_CHANGE_PAGE`指出本阶段V0记录用了未登记的
`production-scheduling`页面ID；11页/58能力/88累计UI路径检查中只有这一错误。
原回执保留为`outputs/delivery-coverage-client/guard-483be024.json`，不覆盖成PASS。
现按原排单页面/客户端的既有清单映射改为`order-detail`、`navigation`，不新增页面或更改
任何产品代码/DOM/样式。后续精确最终commit门禁须实际重跑，不因单测通过提前报PASS。

第二位独立reviewer只读核对了实际V0路径、测试工作流纳入、284证据/58能力原manifest
Git blob、三份输入摘要及四份原型资产字节/hash；无P1/P2。reviewer没有执行测试，
其关于旧摘要落后的建议现前向更新；完整发布门禁的上述失败独立保留。
新V2面板具体v1草图已通过异步问题提交，尚无回复，不自动默认。
本地结果与远端送达、新CI分开登记；当前还没有本阶段新CI或PR。
