# 当前关账镜像：非空恢复与浏览器工程证明

阶段于2026-10-27启动、2026-10-28（Asia/Shanghai）收口。branch `feat/order-closing-month-plan`，clean输入与镜像source **12520f425a4171095495f740ca129df38c61b085**；main沿用已核实869ee84dd0b31de6161011e4aa560678b244a64d，无新fetch或远端写。前一Goal轮次有实际进展：D174来源复核及其本地验收已提交；本轮继续真实镜像验证，不把准备稿当运行结果。

## 精确构建

- 规范Git archive逐一核对**3202个blob、0 tracked overlay**，宿主未安装依赖。旧78ba准备稿仍build=0/rehearsal=0，不借用或覆盖；本片另建独立candidate。
- 镜像 `zhixu-closing-final:12520f42-20261027-aae2a970dd`，ID `sha256:d84fef13481d4ba940e40863c6f1f30a1b768fc690746f7be30068d41f001916`。
- 一次构建**76375ms，code0**，无timeout/overflow；Docker内前端、Server与运行器构建通过。缓存Node基础镜像精确核对，未修改代理/TLS/daemon。前后端BuildInfo、source/buildId与Server authority/session/snapshot一致；`closing-center.html`非空、Server入口存在，**49个迁移文件、最高0050**与源码完全相同。
- 依照Git blob相等复用78ba的网络/持久化harness正负控及ee84的财务回执控制；没有重新执行已成功未变的测试，也不以这些旧结果代替本次运行。

## 一次完整非空恢复：9/9

实际`persistent-local-trial.integration.test.mjs`使用新镜像及两个全新owned项目，**519484ms，9PASS/0FAIL/0取消/0跳过**。source、domain、financial三组opt-in全部开启；不是旧Gate8F的7/9加独立修补结果。

1. 明确空schema初始化，无自动migration/管理员覆盖；签名S3/TLS与内部卷权限检查包含错bucket、错凭据和错误CA负控。
2. 使用既有可信合同、Quote/CCT、加工批次、生产、完成、物流、到货及Source服务写合成非空记录。Source worker是固定fake，真实请求0。
3. 重启及冷容器重建后，原ID、全部领域快照、精确数量/金额、附件字节与原回执一致。
4. 维护停写后由已有exact-target工具备份；独立新空目标拒绝活动writer及篡改对象。**恢复启动和登录之前，121张public表及序列快照一致**；随后恢复对象、启动、原管理员登录及领域读取再核对。
5. DB/附件备份、TLS对象、只读挂载、冲突拒绝等原断言保留。所有阶段完整通过后，harness只清理本次两个成功prepared项目及本次合成备份；没有清理旧卷/备份。失败保留策略未被改成成功清理。

领域快照包含113张非技术表（81张非空），另有7个主域读取、13份主域原回执；Source ledger两次fake worker、两代发布及5份相关回执单独验证。各组不相加冒充唯一总数。

财务组**13张要求非空的表均非空，18个读取及18份原回执**恢复一致：closing commands9、periods2、period versions9、allocations4、allocation versions4、labor adoption1；month plans3、month versions11、month commands8、financial links4。两期锁定版本为4和5。

primary可信Source由100变120后，夹具显式调用D174复核，再调月/匹配/采用；不换SO或覆盖旧计划。一次新增Source复核包含在8条月份命令和18份精确原回执中。分渠道财务行不重复计算实物数量。

Jan显式13%税、1.125件×113CNY产生112.5CNY并锁定；可信后继明确采用4.25USD工价，原售价113与旧快照保持，报价故意新售价9999没有覆盖订单。Feb显式0%税，经销7.25件与加工3.125件合计10.375件，成衣819.25CNY、经销加工30.8125USD、加工服务真实零USD。兼容内部两个USD桶分别保存，年度UI仍只展示两项产值；未以此确认真实收入或付款。

## 当前产物的实际浏览器：9/9

从该镜像复制原静态产物；临时artifact容器未启动、无mount/volume，校验imageId后已删除。以同一source的host TS API、全新disposable PG和全新headless Chromium profile运行原UI测试，**15462ms，9/9通过**。这不是直接对Docker恢复环境做浏览器操作，也没有触碰用户浏览器或61104数据。

覆盖年度两项与范围、部分/整单预览保存、冻结/未知价格、丢失回执与刷新恢复、权限撤回、390px页面及弹窗边界；无浏览器/Server错误。样式未改，不重复早先独立20项responsive suite；不冒称新全仓或用户人工接受。

## 保护与未完成门禁

恢复后及浏览器后各一次只读核对：原**66容器、191卷、33网络、278本地refs**的所选身份/状态/镜像/健康/存在性变化均为空。此观察发生在本片文档checkpoint之前；当前任务分支随后正常追加文档提交，原始提交不重写。不是旧业务内容或全系统状态审计。

本次仅对两个新nonce项目使用四个互不重叠/28，宿主路由与既有Docker网段在prepare前核对；没有修全局地址池、删除旧网络或重试已知默认池失败。61104/source4107演示再次HTTP200，原未保存预览和用户数据保持，不替换为测试镜像。

最终独立复审因模型额度仍**未完成**，不写0剩余P1/P2。旧D169关账页面批准已存在，不能再次当作pending；Source复核、执行方匹配及独立USD采用的具体新UI仍是其他范围。Git/ref STOP根因未解，PR130仍旧61704afe，当前提交未交付远端。Hosted0、真实Source0，无现有账号/业务库操作、merge、正式部署、切换或资产退役。完整Goal未达成。

## 本机原件

私密目录`outputs/closing-final-image-recovery-20261027`保留baseline/prepared、archive路径、构建/运行/浏览器attempt与原日志、两次preservation及完整SHA256清单。

| 原件 | SHA256 |
| --- | --- |
| prepared.json | 6ea376885bf8dbcc3cd80509763a95dd1b4926dd9e58e6574f4068086b8188bb |
| build-result.json | 31c92efee48d6aeca9158bfdd9dde43fad0e0e19f7408f8d0e2692829d577839 |
| image.json | 277b9fd4dc4dc5277a471940bf1f1d16cc933b48e6c8123a75967e368afbefc1 |
| runtime-result.json | 85557c3835dbfa9e0de5827b13325faf9334a5fde31a244d192915773f660fa1 |
| browser-result.json | f241ec39486bde5bd0dbf485ea3ad3dee06892968bc8933c5703c5e3ed304428 |
| preservation-after-browser.json | 2d4ff64c73fcf50ad9b3337e17cf89059351f6665f5dd5d387352f75949aef31 |
