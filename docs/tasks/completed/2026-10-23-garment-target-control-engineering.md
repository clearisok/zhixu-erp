# Gate7G 成衣目标后台配置工程证据

2026-10-23，Asia/Shanghai。主控root，既有独立reviewer只读。

## 精确范围

- main `d1dd4f0fcf9992d5c055c7b67b6832b635485680`；前一clean baseline `81ce0a015a17cfa74bf6b006dc97d9ee36468a8a`。
- 源码 `5fac2326634375ded9935782df947ce5871eab43`，tree `632b9126797529baa4246233f2c8b53836060f95`，branch `codex/server-garment-target-control`，源码checkpoint clean。
- 17路径增量：0044空技术回执、内部单SO plan/apply/receipt、原归一两FK引用、审计action/entity类型及V0精确路径说明、测试和文档。旧迁移均未变化。
- 无新CLI/HTTP/Catalog/调度或实际target启用；无Source/真实凭据/私密报告读取、既有账号/DB操作、镜像或部署、merge/close。三项fresh业务权限加bind，不新增权限key或授权。
- 旧用户运行态refs `ebe4cb16c8f5ea65df6243d8a5627094c6f62da1` / `4cf19e823b14fd2167081dd9d0c755278ce4322b`精确保持；既有3001/50426/59069等、Browser/对象/卷和工作树不变。

## 实际检查

| 检查 | 结果与范围 |
| --- | --- |
| 新定向，clean源码5fac | 20/20，12999.5089ms，0失败/取消/跳过 |
| 独立复审P2修复后的定向 | 20/20，12674.2402ms，0失败/取消/跳过；与5fac产品相同 |
| 原采集控制 | 33/33，18887.1627ms，0失败/取消/跳过 |
| 原观察/客户端/PG/升级 | 85/85，27384.3863ms，0失败/取消/跳过 |
| 原完整归一/执行引用 | 33/33，28243.9022ms，0失败/取消/跳过 |
| 5fac精确native archive全量types | 退出0，28378ms |
| 同archive Server编译 | 退出0，10561ms |
| 同archive完整lint | 退出0，53643ms |
| 同archive显式Server UI构建 | 退出0，15162ms，46路由/0skip，单ServerSessionContext，无missing provider，旧用户路由生成 |

原33/85/33属于source checkpoint前已登记工作增量，相关原执行文件保持；其后仅本模块审计ID修复和新0044索引，最终20包含两者。不将旧回归改名为稳定5fac全套。独立reviewer阅读实际源码、测试和日志，发现审计operationId未含actor的P2；新增两个actor/同UUID/不同SO均成功但两组审计独立的实际PG测试，修复后reviewer确认P2关闭、无其他P1/P2，未自行运行测试。

新定向验证具体proof/显式时效、原scope、无target停用no-op、profile/绑定读取不可用时仍可停、历史alias、两入口事务竞争、真实角色行锁等待后撤权、publication锁等待后过期、审计/回执全回滚、真实COMMIT成功后丢回执、旧enable不重启、旧采集失效、旧观察时效冻结、损坏回执及完整引用hash。0043非空升级逐表逐行JSONB字节不变，新账本空、原目标/0043命令/观察均保留，精确迁移ledger与重复验证通过。

## 构建身份

原生长路径临时目录 `C:/Users/Administrator/AppData/Local/Temp/zhixu-garment-target-qa-njSM9O/context`；Git archive SHA256 `60dd037fe05e6fd88341f8e7ae4d76fa20e415213b68ccf910a7e54821ca0071`。仅junction现有依赖，未安装或更改共享运行时。

buildId `server-garment-target-5fac2326-20261023`，source完整5fac，buildTime `2026-10-23T12:56:41.263Z`；production、Server/session/writable/snapshot。QA终态2026-10-23T12:58:37.785Z，HEAD稳定、dirty空。构建不等于Docker镜像、实际浏览器像素接受、部署或真实来源激活。

## 原失败与终态边界

- 第一次误用不存在的build:server脚本，没有开始编译；改用既有server:build通过。
- 首轮19项16pass/3fail（含父项，12723.7373ms）：夹具删除受保护mirror、缺case event。保留原SQL保护；改为原连接中禁止相关依赖SQL的故障注入，并补合法案件事件。
- 第二19项17pass/2fail（含父项，13673.2579ms）：夹具错误归一两个不同可信合同，原约束正确拒绝。改用原repository合成历史manual主单，不开放手工新SO入口。第三19/19通过12436.4117ms；随后独立P2修复增为最终20。
- 根目录types因既有ignored outputs旧源码参与，出现旧cloudflare类型和新旧OperationLog重复类型。未删除旧产物或放宽tsconfig；同5fac精确archive类型通过。
- 首次全项目npm test在新增D160证据绑定前启动，937项922pass/15fail，514745.8556ms，0取消/跳过；15项均为发布守卫对尚未前向绑定决策的 `EVIDENCE_WORKTREE_DRIFT`，不冒称全套通过。随后需追加不可变D160/feature/本报告并在新清单重验项目/发布；原失败日志保留。
- 本记录冻结时最终main守卫与发布134尚未运行；后续终态只追加阶段记录，不改此报告字节。没有Hosted CI结果。

## 本机可核对日志hash

根目录为ignored `outputs/garment-target-control-20261023/`；原文不上传。

| 文件 | SHA256 |
| --- | --- |
| clean-targeted.log | f53bcadfef09c8e6ba88c066198f154382c9f28c2613a08a06c15c7f342aaacb |
| review-fixed-targeted.log | a366f922d8555c9c80f3f5fc376a5687de8dc839baec0e7fd427ca71d334ffc5 |
| collection-regression.log | f5b1aeb8de157664530d942faeaa83daafa5767441d59f791211335c37fbf804 |
| observation-regression.log | 2fd322b3a8582285131b94d2051f351ee3b7c549274472550f964a096ec681ee |
| reference-regression.log | 7813b10183acbe819bf22ca5882e5e083d0994a919fbbd6c12c41e3a44d03af0 |
| initial-targeted.log | 143050f06b4bc9490230579baaaa752c621fe4f562547c19051fefb57732c3e1 |
| second-targeted.log | fa2423b5ef6e1c4e8bf924c6f240dcff0c0e72a928b19ad958db6acd6f44cb64 |
| initial-typecheck.log | 53abce42c5608f9251f3f56b9f51e9c4a976cfb18365199f4c3c5ec310fac559 |
| project-regression.log | e94eedb0ac01705d7235bb883f5b198b62da8cadc588574fc20d282df2dce36b |
| exact-qa/result.json | dc92cd0b451c6fd16003b0b6376921da28f8d8bad055462870bee89f14e97f3a |

前一Gate7F的02c22576唯一push为uncertain_transport/NETWORK_DEGRADED，独立API确认新分支不存在；本Gate没有再push或API更新PR。#123/#125账单限制未解除，不触发CI，不改账单。真实启用、查询额度、多页/事件、关账待决及50426切换分别待后续Gate；完整Goal未完成。
