# Gate7D：成衣观察原始总数一致性

2026-10-22，root唯一writer，既有reviewer只读；D147已批准工程内的错误修复，不改变D152/153业务口径。

## 起点与范围

- 独立GitHub main仍996dfedc12da3527343cd3ff2aa5eea35497e10e；从它建codex/garment-observation-total-integrity，仅FF干净1031d5d55905992ea1d12f075f63d3d22a956779，无继承dirty。原根三摘要逐字节归档至completed/2026-10-22-garment-total-integrity-inputs/1031d5d5。
- 1031已通过一次既有工具普通push，DELIVERED_VERIFIED/exit0/remote exact；独立API复核相同SHA。Source39656324228、Team39656336108、Baseline39656348774精确1031均已启动，尚未终态。没有新建累计PR、merge/close/deploy。
- 旧384非零/STOP/root-cause unknown保留；本次成功不是永久网络修复。唯一可信目的地、无hook、matching-refs成功空数组及receive-pack dry-run成功后，按用户持续恢复授权仅实际push一次，附加诊断只原参数透传与脱敏摘要。证据在ignored outputs/git-recovery-gate7c。

## 已定位缺陷与最小修复

`garment_shipment_observations.py`优先dataCount但不核对同时存在的dataList.total；dataCount=1/total=101/一行可被接受，再由两遍相同输入形成完整一行观察。固定过滤核验工具已核对双总数；Node checked-page协议只接收到一个reportedTotal，不能补救丢弃的矛盾。独立静态review确认P2。

只在无IO原文解析器核对并存双总数，继续用原严格count；副字段null/布尔/数组/非法数字拒绝，合法相等及单字段响应保持兼容。添加精确数字/编码dataList/零行/分页负测；不改Node协议、SQL、旧快照、默认开关、UI或金额口径，不扩大或执行真实读取。

先新增回归证明red，再最小实现并跑定向与完整Python；核对原观察Node/PG边界及发布门禁。实际结果、独立复审、commit和远端/CI分开追加；本段不预写通过。

## 后续边界

正式收集器仍须固定来源范围、页序/双遍/预算、原文保全、发布CAS与未知结果回执设计；本修复不是收集器、来源激活或事件总账。C1/C0/C1额度此前已问未答复，0新增真实请求，不读取旧私密候选或凭据。关账三项原问题仍待答复，不默认同意或重问。保护3001/50426/59069/62426等旧环境、账号、卷、Browser和工作树；完整Goal active。

## 已执行验证与中间结果

新增回归先red：7方法、16个子例失败，证明优先dataCount确会漏报。修复后8方法通过；补显式主字段null不允许回退的非阻断负例后完整Python166/166再次通过（2.283s）。原85条Node纯契约/PG/HTTP/升级全通过（24766.5313ms）；独立review无新增P1/P2，兼容指合法旧捕获，旧矛盾原文现在拒绝是预期。未改任何已有快照。

初次发布检查90/99、9失败均为PROJECT_INDEX缺完整main SHA的STATE_BASELINE_DRIFT，工作树守卫同因失败；原日志保留。已只补回完整996dfedc12da3527343cd3ff2aa5eea35497e10e，未改清单、截图hash或检查规则，完整发布重跑中。该Phase没有TS/UI/schema改动，不新增浏览器、类型、lint或构建运行声明；原1031及其Hosted CI范围单独保留。

1031的新Team39656336108和Baseline39656348774均completed/success/attempt1，已逐job/step核对；Source39656324228仍在原编译/迁移/来源回归阶段，不重派或冒称通过。

## 本地收口

最小修复后的完整Python166/166（2.283s）、原观察Node/PG/HTTP/升级85/85（24766.5313ms）、修正文档后的完整发布116/116（187506.7916ms）全部通过，0跳过。先前发布90/99与9项STATE_BASELINE_DRIFT保留，修复只补索引完整基线，不改规则或旧证据。工作树源码守卫对完整main996通过（11页/54能力/80累计UI路径/errors=[]），最终commit后另查精确HEAD。

三份归档的Git blob与1031原文逐项一致；release baseline全包与1031完全相同（259证据/54能力），app/components/features/server/database/.github无本Phase差异。独立静态复审无新增P1/P2；追加显式主total=null负例后166完整Python重新通过。冻结报告/截图/hash未修改。本Phase不冒称新type/lint/build/浏览器运行。

1031的Source39656324228已通过Compiled、Quality和Explicit build，19:02 UTC仍进行P6浏览器；Team与Baseline终态success保持。接下来只stage本Phase十份新增/改动文件独立commit；精确HEAD守卫、一次有界交付及新CI结果存ignored outputs/garment-total-integrity/checkpoint-final.json，未核实前不宣称送达或CI通过。完整Goal继续。
