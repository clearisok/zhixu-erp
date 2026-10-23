# Gate7F 成衣受控操作者工程证据

2026-10-23，Asia/Shanghai；工程验证，不是来源激活、部署或人工业务接受。

## 基线与精确对象

- main：d1dd4f0fcf9992d5c055c7b67b6832b635485680；开始11:23:47.807Z、冻结前11:56:54.814Z独立GitHub API重读相符。#123/#125仍草稿，既有未获新合并授权的PR未合并/关闭。
- 分支：codex/server-garment-operator，从main建立后FF干净8f2b32703af7ba7a7afe6fd89a2b5454fd1518a1；无继承dirty。
- 产品源码checkpoint：ee6f570f5c689569b088cc5af28a64c7795821f3，tree d67f1a5308a3000f155cd99f06598c8a465c2349。
- 最终类型修正checkpoint：461841c0542f05f01e2677877df59af3b45d5bc3，tree 610e0b6e809ec0d516d78870c9644a27db91cd15。相对ee6f只有纯测试一条字段存在性断言及三份状态文档；产品、SQL、workflow、package逐Git blob不变。所有工程检查后HEAD稳定、工作树干净。

旧用户运行态refs feat/business-operation-logs=ebe4cb16c8f5ea65df6243d8a5627094c6f62da1、codex/server-persistent-empty-target=4cf19e823b14fd2167081dd9d0c755278ce4322b精确保留。原8f2一次上传的STOP_AUTH_OR_DIVERGENCE与独立exact远端结果分别保留，未重推、不假报协议恢复；本阶段至冻结前无GitHub写入或CI dispatch。

## 实现范围与可执行链

新 `garment-operator-cli.ts` → 原私密ACL/hash/UTF8/单链接读取 → verifyMigrationsCurrent（只检查）→ 现有actor → 原D158 plan/collect/receipt。没有第二套collector、发布器、目标或回执系统。

仅三显式动作：plan-collection、collect-once、receipt，报表固定6086979。严格单SO私密job；完整原producer filter-private报告在原checkedAt重新构建、全包装比对后才提取内部证明。plan只读；新采集必须当前scope相等后才打开凭据，原控制层继续在worker前重校验。既存UUID重放不读取秘密。receipt直接核对原actor/UUID，不打开证明或凭据、不重建计划，也不要求当前target仍启用。

worker仍为单合同两遍首页100行、1登录/2报表/3HTTP、每响应4MiB/报表8MiB、180秒、零重试；hash/确认短语不是人类请求额度。原Num/outdate、不跨次累加、稳定颜色、实际生产完成及商业金额所有权不改。未核实COMMIT即使带暂定published也不公开成功，报告失败退出2并要求核对原请求；不换UUID或回收started。

`live-preflight.ts`仅新增受保护报告kind/文件名前缀，秘密检查器/ACL/不可覆盖写保持。package和原Source workflow只注册新入口及测试。没有UI/CSS/路由、HTTP、SQL/schema/migration、权限目录、真实target或调度改变。

## 实际执行结果

以下均0fail/cancel/skip；数字为原runner计数（含父测试），重叠集合不相加。

| 检查 | 源码及实际结果 | 范围 |
| --- | --- | --- |
| 新入口完整定向 | ee6f，15/15，251843.0245ms | 原producer完整包装、范围/证明/期限/actor/DB先于秘密、空schema只读拒绝、现存自定义actor撤sync/缺凭据0worker/0命令、同UUID并发一次、删证明/秘密后历史receipt、报告落盘丢失、原head保持；实际干净已提交源码子进程receipt退出0/历史published/Source读取none |
| 原控制层回归 | ee6f工程期间，33/33，20721.6352ms | 原worker精度/固定范围，started/terminal COMMIT丢回执、撤权、scope变化、原子发布/审计回滚、旧head及0042非空升级/引用保护；产品输入未修改 |
| 共享私密/预检/恢复 | 40/40，252610.6654ms | 原ACL/UTF8/hash/硬链接/秘密字段、私密报告、固定恢复及实际180秒Windows外层超时。运行跨ee6f→4618的测试/文档提交，相关可执行文件逐blob不变；不冒称单次固定HEAD全套 |
| 窄化后纯测 | 4618，5/5，18275.1847ms | 修正类型断言后重新执行，包装变造/裸三字段/跨账号/未来时间/未知COMMIT公开投影继续拒绝 |
| 全量typecheck | 4618精确archive，退出0，28644ms | 不是根工作树误扫ignored旧context |
| Server编译 | 同archive，退出0，10531ms | 新CLI及原运行代码编译 |
| 完整lint | 同archive，退出0，51310ms | 原完整规则，无新增忽略或禁用规则 |
| 显式Server UI构建 | 同archive，退出0，14233ms | 46路由/0skip，只有一个ServerSessionContext，旧用户路由生成；build-info源码4618/Server/session/snapshot精确 |

新构建仅自有临时Git archive，未安装依赖，现有node_modules只作junction。native长路径context，archive SHA256=ee80029d8824803d11a8a93de692594e04b624160ec105025af09a7cff038702。build ID=server-garment-operator-461841c0-20261023，build time=2026-10-23T11:53:07.921Z，Node24.16.0。不是新Docker镜像、运行态升级或新浏览器像素批准；本阶段没有UI改动，实际操作者入口由源码子进程验证，不借旧built浏览器结果。

既有独立reviewer只读复审ee6f及4618和上述日志，未执行测试或真实数据操作。发现的P2“无法直接消费现有完整核验产物”已由严格wrapper adapter及负测关闭；最终无剩余P1/P2。冻结/清单/134发布门禁与其后远端、CI结果不在本报告冻结时预报。

## 原失败与修正

首次Server编译四个窄化错误，修正正则match/可空证明后通过。首轮PG9项3pass/6fail（含父，148224.27ms）：一项期望了原BootstrapGuardError不存在的code；其余为固定夹具时钟在Windows ACL耗时后落后数据库started_at，原expires>started约束正确拒绝。CLI只加静态actor错误映射；夹具每单使用实际起点和原允许九分钟期限，过期回执后下一单重置时钟；没有放宽SQL/许可保护。第二轮13/13仍只属于早期三字段版本，不当作最终包装验收。

独立复审发现完整包装衔接P2后，合成fixture直接调用原producer；adapter保留原checkedAt，不要求人工复制/刷新原证据。ee6f定向15通过后，全量archive类型检查发现纯测union字段未先narrow，后续编译/lint/build未运行；原失败context保留。4618只增assert.ok保留原断言，再重新完成上表全量检查。失败不改成PASS，不抹除测试或放宽产品校验。

## 可复验工程索引

原日志位于ignored `outputs/garment-operator-20261023`，只作本机工程证据，不上传临时日志或原始私密文件。关键SHA256：

| 文件 | SHA256 |
| --- | --- |
| clean-targeted.log | d12c08c4b4644ad24a9b2cde1bf125a2d5c37ef7237f15245af404559ead7d68 |
| control-regression.log | aa66a50cd1f343a1932fb6e2b0ce24000735d741eaaf527dbd08417b96cc899c |
| shared-private-regression.log | 687980cba890ab52ae0299005c5cb543bc46b77341b36b1296bc34d17c0fcda9 |
| final-unit.log | 3451432756f3163f382d7e389251d6ab41b6fd637d3af525f44d1aa76c4b3c09 |
| exact-qa-final/result.json | d0bc220d6036aab21439532ce79e55026c6ffc26c6ede6d0729ed70a99149a80 |
| initial-integration.log | dff220b5f90acee05ccb7bba8ee5ad662e56471e687fb7569076a954386cff1b |
| exact-qa/result.json | d8e48513a7d01a91d1a5aae00790bffb4ea52c6fde6d759444496287721bbf0c |

`engineering-scope.json`保留11:56:54.814Z独立main读数、12项精确增量、相关Git blob无差异、原refs和native QA完整结果。实际全部Source worker均注入合成传输；真实Source请求0，未打开本机真实凭据或私密来源报告。仅自有一次性PG/私密夹具，现有用户/业务库、Browser、对象/卷、3001/50426/59069/62426等运行入口原地保护。

## 后续与边界

下一步追加不可变文档证据及本能力implemented/isolatedTest新评估，保留全部原对象/其他状态，再完成精确main守卫、发布134与证据复审。Git协议STOP与Actions Billing阻断分别保留，不自动重推/重派、merge/close、改账单、部署或退役。

原target真实启用/生命周期、具体新采集授权、多页实证、跨次事件及取消/冲销、Server关账三问、coverage-v1/50426切换与逐项旧环境退役仍独立待Gate。只完成工程操作者不表示成衣业务闭环、真实采集成功或用户已体验。完整G1–G5目标继续。
