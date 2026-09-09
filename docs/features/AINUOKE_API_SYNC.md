# 艾诺科个人账号与只读 Direct API

## Purpose

为本地 Windows 原型建立 `Zhixu User → 0..1 Personal Ainuoke Account` 与只读 Direct API Source Adapter。每个织序测试用户使用自己的艾诺科账号，保留艾诺科本人的权限与待办身份；不使用公司共享账号或管理员高权限账号。

当前 Zhixu User 仍是 browser-local mock identity。本模块只能称为“本地 Windows 原型的个人账号绑定”，不是生产级多人认证、安全隔离或服务端授权。

## Security contract

- Password 只能进入 Windows OS Secure Credential Store；实现优先使用 Python `keyring` 与 Windows Credential Manager。禁止进入 localStorage、sessionStorage、IndexedDB、浏览器备份、Quote、SalesOrder、Style Progress、OperationLog payload、console、文件日志、telemetry、Git 或已提交 `.env`。
- Ainuoke JWT/token/session 只存在 Local Bridge 进程内存，并按 bridge session 所绑定的 `Zhixu User.id` 隔离。Bridge 重启后 token 消失并要求重新登录。
- Bridge 只允许绑定字面量 `127.0.0.1` 或 `::1`，拒绝 `0.0.0.0`、局域网地址和可解析主机名。CORS 使用精确 Origin allowlist，禁止 `*`。
- 每个浏览器交互会话使用 HttpOnly session cookie + 独立 CSRF nonce；会话在 bridge 内存中绑定一个 mock user。账号与报表接口从该会话取得 user context，不接受每个请求随意提交 userId。
- Origin allowlist、HttpOnly cookie 与 CSRF nonce 是本地攻击面的附加保护，不会把 browser-local mock user 变成可信认证。能控制浏览器本地状态或启动会话的本机用户仍可能冒充其他 mock user；生产化前必须改为真实 Zhixu authentication，并由服务端确定 actor。
- 艾诺科当前登录目标是 HTTP。凭据在 bridge 到艾诺科链路上没有 TLS 保护，这是已知安全限制；不得把本原型描述为适合跨主机或不可信网络。
- 日志禁止输出完整 login URL、raw login response、password、JWT/token、session/cookie 或不必要的 PII。credential invalid 不自动循环 retry；network error 仅有限 retry/backoff；auth expired 最多重新登录一次并 replay 原 read 一次。

## Personal account contract

Local Bridge 提供：

- `GET /v1/ainuoke/account`
- `PUT /v1/ainuoke/account`
- `POST /v1/ainuoke/account/test`
- `DELETE /v1/ainuoke/account`

GET 只返回 username/脱敏标识、configured、status、lastVerifiedAt、lastSuccessfulLoginAt、lastErrorCode，绝不返回 password、token 或 session。PUT 接收 username + password，先真实登录验证，成功后才原子替换旧 credential；失败时旧 credential 不变。DELETE 删除该用户 credential 并清理该用户全部内存 token/session cache。

个人账号绑定使用 self-scoped `ainuoke.account.bind_self`。既有 `ainuoke.bind` 仍只表示“把艾诺科销售合同绑定到织序订单”；个人绑定不会授予 `ainuoke.sync`、业务合同 bind 或冲突处理权限。

## Read-only report/source contract

固定 Report Catalog 只有：

| Catalog key | Report ID | 名称 | 未来消费边界 |
| --- | --- | --- | --- |
| `sales_contracts` | `6086103` | 销售合同 | common source model → existing `AinuokeContractMirror` → existing matcher/service |
| `sales_contract_color_sizes` | `6086997` | 销售合同颜色尺码明细 | common source model → existing `AinuokeContractMirror` → existing matcher/service |
| `material_purchase_statistics` | `6087050` | 面辅料申购统计 | common source rows → existing Normalize → Dedup → Validate → Preview → `commitImport` |

Browser 只能提交 catalog key，不能提交任意 reportId。Bridge 负责 login、auth、paging、timeout、有限 network retry、字段脱敏和 read DTO；不负责 Matcher、订单创建、Material commit、Canonical identity、Risk、Logistics 或 Domain mutation。本阶段不调用 `commitImport`。

已确认真实协议（2026-09-08 requests + Scanner）：base 为 `http://61.164.81.194:9043`，登录为 `GET /kaijin/system/user/loginsys2`，Generic Report 为 `POST /kaijin/report/report/getReportObjAndData`，System Id 为 `6080183`。上游是 HTTP，不是安全链路；base/report path 仍允许进程级覆盖，但上述事实是当前默认值。

- 登录 query 固定包含 `userName/password/verifyCode/cltType=1/rememberMe=true/jsCode/isCoverLogin`，并使用已捕获的 Accept、`X-Requested-With: XMLHttpRequest` 与 login Referer。只有 `data.isOk === true` 且同时存在非空 `data.jwtToken`、`data.sessionId` 才判成功；raw URL/response/userObj/PII/secret 不记录。
- 报表鉴权按捕获请求发送原值 `Authorization: <token>`、`Token: <token>` 与 Cookie `kaijin_my_token=<token>; rungingSysId=6080183`；不使用未经验证的 `Bearer` 假设。token/cookie 永不返回 Browser。
- Browser query DTO 目前严格只有非空 `insideOrderNo`。6086103 映射为 `InsideOrderNo + contains + [内层]`，6086997 映射为 `InsideOrderNo + is`，6087050 映射为 `insideorderno + is + [内层]`。Bridge 构造 `reportId + sqlCdtn(pageIndex/pageSize/conditionList/sqlParamList/orderFieldList) + isFirstTime + isIniPage`；这三种已捕获的过滤请求均不猜测或发送 `formId`。
- 响应必须含 JSON string `dataList`，解析后必须是含 mapping rows 的对象；total 读取真实 `dataCount`。该 endpoint 成功返回时顶层 `pageIndex/pageSize` 可为已验证的 `0/0` 哨兵，此时保留请求中已验证的分页值；缺失、负数、非数字、分页冲突或 malformed `dataList` 全部 fail closed。

每个 `ReportSnapshot` 必须保存：`schemaVersion`、`reportId`、`fetchedAt`、`page`、`pageSize`、`total`、`queryContext`、每行 `sourceRowIdentity`、sanitized source error（失败时）及 deterministic `snapshotHash`。当前 schema 为 `ainuoke-direct-read.v2`。hash 对同一 report/page/query/rows 稳定，不把 fetch timestamp 算入 identity；所有 source DTO 再次移除 secret-named fields。6087050 是 joined view 且 `id` 已确认重复，因此不能使用 `6087050:<id>`；三张报表都没有足够证据证明 `id` 唯一，统一采用 report-specific canonical full-row SHA-256，identity 不依赖 API page position 或排序。

## Current implementation boundary

- Python Bridge：`tools/ainuoke-bridge/ainuoke_bridge/`；`KeyringCredentialStore` 启动时拒绝非 Windows Credential Manager backend，browser session、CSRF nonce 与 Ainuoke JWT 均为 process-memory state。
- Browser client/UI：`features/ainuoke-api/` 与 `/my-settings/ainuoke-account`。密码输入从不回填，GET view 不含 secret；切换 mock user 会新建对应 bridge session。
- 上游默认 base/login/report path 已按真实请求固定；`/my-settings/ainuoke-account` 另提供 D1935 固定 Catalog 的只读验收面板，只显示行数、total、paging 与字段名，不输出 raw response 或 secret。
- 当前只返回 read source snapshot，尚未把 API 数据写入任何浏览器 Repository，也未调用既有订单同步或 Material `commitImport`。
- 既有 Excel Ainuoke Matcher、Order Sync、Material Normalize/Dedup/Canonical resolver、Material Logistics Service 与 OperationLog 保持唯一，不建立第二套。

## Verification

Python tests：`tools/ainuoke-bridge/tests/`；browser/source contract：`tests/ainuoke-personal-api.test.mjs`。覆盖脱敏真实 login/report fixture、三报表 condition adapter、header/cookie、`dataList` parser、0/0 paging sentinel、6087050 repeated id、固定 allowlist、unknown/write-like endpoint 拒绝、loopback-only、Origin allowlist、CSRF/session、credential/token 隔离、retry 上限、auth expiry 单次 replay、替换失败回滚、unbind 清缓存、process restart、deterministic source hash 与 Secret Leakage。

2026-09-09 真实只读验收：个人账号由用户本人通过 UI 输入并保存到 Windows Credential Manager；登录成功。D1935 的 6086103 为 HTTP 200、1/1 行；6086997 为 HTTP 200、第一页 50/187 行；6087050 为 HTTP 200、第一页 50/262 行，字段结构与脱敏 Scanner 清单一致。6087050 该页实际出现 1 个 repeated-`id` group，50 行生成 50 个唯一 `6087050:sha256:*` identity。浏览器 console 检查 16 条记录、secret-pattern 命中 0；没有调用 Ainuoke write API、`synchronizeAinuokeContracts`、`commitImport`、SalesOrder write 或 Style Progress write。上述行数是当次上游事实，不是稳定业务常量。
