# 成衣观察受控操作者入口

## 职责及前置条件

2026-10-23，D159 / D147 Gate7F。复用[不可变观察及单次控制层](SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)，不另建采集、目标或回执模型。原文档Gate7E“尚无CLI”是该阶段的冻结范围；此入口独立增加，不改已确认Num/outdate、跨次不累加、颜色或金额所有权。

源码入口为 `server/ainuoke-source/garment-operator-cli.ts`，命令 `npm run source:ainuoke:garment-operator -- --help`。只允许从包含此入口的干净、已提交源码树运行；复制的编译入口不能冒充原源码提交。Node须支持现有无损数字解析。私密文件使用原ACL/原生路径/普通文件/单硬链接/有界UTF8/SHA校验，输出只写新的受保护ignored报告，不覆盖已有报告。

必须事先具备完整当前schema、现有启用操作账号、可信合同SO、匹配的Source profile，以及另行批准启用、保存具体过滤证明hash和时效策略的target。入口不迁移、不初始化账号、不建单、不绑定或启用target；也没有HTTP、持续调度、重试或分页开关。没有这些条件即拒绝，不用测试SQL或默认值替用户激活来源。

## 三个明确动作

| 动作 | 行为 | 凭据 |
| --- | --- | --- |
| `--plan-collection=6086979` | 只读预览，核对原证明、实际库/账号/合同/颜色/目标/head，生成有期限的scope hash | 不读取 |
| `--collect-once=6086979` | 使用原UUID、期限及精确hash，重验当前范围后读取私密凭据，调用原 `collectGarmentOnce` | 仅新请求、范围通过后读取 |
| `--receipt=6086979` | 以当前有效权限直接读取原actor/UUID回执，不重建计划、不采集 | 不读取；也不打开过滤证明 |

三者均要求 `--job=<绝对私密JSON路径> --expected-job=<SHA256> --private-output=<受保护ignored目录> --request-id=<UUID>`。plan/collect另需毫秒UTC格式 `--expires-at`，新请求期限最多10分钟。collect另需 `--scope-hash`、`--execute=I_CONFIRM_EXACT_SCOPE` 和 `--credential-file=<绝对路径>`。不接受合同、报表、SQL、worker、target-enable、重试等额外参数。hash/确认短语和工程计划都不授予真实Source请求额度；真实读取仍按D147单独、具体授权。

新请求固定一SO、一合同、6086979/ExpContractNo/is/[内层]，两遍各首页100行；原worker最多1次登录、2次报表、3次HTTP、每响应4MiB、报表8MiB、180秒及零重试。总数大于100停止，不用原模型的20页工程上限扩大本命令范围。目标的具体C1/C0/C1完整证据必须再次通过原控制层验证；原checkedAt不改为当前时间，不把某账号/合同证明泛化到其他范围。

## 私密job与证明

job严格只含：

```text
schemaVersion: ainuoke-garment-operator-job.v1
databaseUrl: 明确的PostgreSQL连接URI（仅私密文件）
operatorUsername: 已存在的操作账号
salesOrderId: 可信SO UUID
source: {baseUrl, sourceKey, username, transportPolicy?}
verification: {path: 绝对受保护ignored文件路径, sha256: 原文件SHA256} 或 null
```

source不允许密码、权限或任意查询。verification指向原固定核验/恢复工具的完整 `ainuoke-garment-filter-private.v1` 文件（含原toolingCommit、queryManifest、validationStatus、selection、evidence、checkedAt等），不接受手工裁出的三字段文件。先验证原文件ACL/hash/重复键，再用原验证器在原checkedAt重建全部包装并比对，最后只提取原 `{selection,evidence,checkedAt}` 交控制层；不复制原文、不更新核验时间。框架计数保持整数，原始报表字符串由原验证器再次无损解析。job上限64KiB，证明上限48MiB。receipt允许null；即使原指针文件已删除、target关闭或permit过期，也只核对历史回执。改变原请求意图不能冒充同UUID重放。

## 回执与未知结果

公共回执仅显示动作、原请求、计划hash/期限或已核实终态、历史标记、计数和发布标识；不反射连接串、源账号、密码、合同、原文、颜色、数量或任意错误文字。私密报告复用原严格秘密字段检查，只有固定计划免责声明改名为 `humanApproval=still_required`，不放宽检查器。

plan成功或已核实published退出0；参数/鉴权等拒绝退出1；not_published、unknown/started/claim/COMMIT未核实、报告写入失败退出2。未核实COMMIT即使携带暂定published结果，也不显示成功或发布标识。报告写失败可能发生在真实事务成功之后，必须按原UUID用receipt核对；不存在回执也不证明没有发生工作。没有自动换UUID、重采或回收started。

成功快照、颜色、head、原审计及终态仍在原控制层同一事务；新CLI没有第二次发布、终态或审计事务。网络不持DB锁。旧schema与旧引用不改，实际生产完成、价格/CCT、收入和关账均不由本入口写入。

## 验证范围

`npm run test:garment-operator` 使用合成证明/私密文件、计数fake worker与自有一次性PG，覆盖参数/重复键、预览、错范围先于凭据、并发单次、删除证明/凭据后的回执、报告丢失及实际干净源码入口。原 `test:garment-collection-control` 继续验证COMMIT丢回执、原子发布/回滚、鲜活权限与引用。CI接入原Source workflow；本地通过不冒称账单受限Hosted CI已运行。

独立工程范围、原失败和最终精确提交结果记录于[Gate7F任务](../tasks/active/server-garment-operator-2026-10-23.md)。真实target生命周期/批准激活、其他合同及多页实证、正式采集运行、跨次事件、Server关账和50426切换仍是后续Gate；本入口完成不代表真实业务闭环或用户已体验。
