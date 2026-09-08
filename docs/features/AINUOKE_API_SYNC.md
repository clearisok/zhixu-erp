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

每个 `ReportSnapshot` 必须保存：`schemaVersion`、`reportId`、`fetchedAt`、`page`、`pageSize`、`total`、`queryContext`、每行 `sourceRowIdentity`、sanitized source error（失败时）及 deterministic `snapshotHash`。hash 对同一 report/page/query/rows 稳定，不把 fetch timestamp 算入 identity；所有 source DTO 再次移除 secret-named fields。

## Current implementation boundary

- Python Bridge：`tools/ainuoke-bridge/ainuoke_bridge/`；`KeyringCredentialStore` 启动时拒绝非 Windows Credential Manager backend，browser session、CSRF nonce 与 Ainuoke JWT 均为 process-memory state。
- Browser client/UI：`features/ainuoke-api/` 与 `/my-settings/ainuoke-account`。密码输入从不回填，GET view 不含 secret；切换 mock user 会新建对应 bridge session。
- 上游登录 path 固定为 `/kaijin/system/user/loginsys2`；base URL 与只读 report-data path 必须在进程启动参数或当前进程环境中提供，不提交 `.env`。仓库目前没有已确认的 report-data path，因此不得声称完成真实 D1935 live read。
- 当前只返回 read source snapshot，尚未把 API 数据写入任何浏览器 Repository，也未调用既有订单同步或 Material `commitImport`。
- 既有 Excel Ainuoke Matcher、Order Sync、Material Normalize/Dedup/Canonical resolver、Material Logistics Service 与 OperationLog 保持唯一，不建立第二套。

## Verification

Python tests：`tools/ainuoke-bridge/tests/`；browser/source contract：`tests/ainuoke-personal-api.test.mjs`。覆盖固定 allowlist、unknown/write-like endpoint 拒绝、loopback-only、Origin allowlist、CSRF/session、credential/token 隔离、retry 上限、auth expiry 单次 replay、替换失败回滚、unbind 清缓存、process restart、deterministic source hash 与 Secret Leakage。
