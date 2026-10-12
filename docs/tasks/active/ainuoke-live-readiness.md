# 艾诺科真实接入：无数据库的只读连接核验

核实日期：2026-10-12（Asia/Shanghai）；GitHub main：`21fbe3b1a7a5968253f923bc904ea067315f00cd`。
分支：`feat/ainuoke-live-readiness`；从上述 main 新建独立 worktree，起点 clean。
更新时机：main/PR、测试、来源通道、账号授权、真实读取、绑定或部署状态变化。GitHub 是实时事实源，本文件是阶段快照。

## 用户决定与已确认事实

- 用户对统一本机演示说“好的 通过”，并明确“授权合并 PR #100，再开始下一轮”。验收仅覆盖当时本机合成账号、登录/报价导航/订单/物料体验；不代表真实来源覆盖、真实金额或上线验收。
- PR100 head `cc80819890844d0700999f2136c8ad6c9528816b` 三项 CI 成功后，于 `2026-10-12T14:57:34Z` 合并；merge/main SHA 如上。PR101 登录已先合并。
- 用户确认仍用 `http://61.164.81.194:9043`，其他通道待查。用户未发送真实密码，本轮未读取或复用 Windows 已存凭据。
- Windows 无凭据 HEAD `/kaijin/login.html` 在 `2026-10-12T14:59:48Z` 返回 HTTP 200。同地址/端口 HTTPS 正常 TLS 验证握手失败（curl 35 / Schannel SEC_E_INVALID_TOKEN）；没有使用跳过证书验证。这只说明尝试的 HTTPS origin 不可用，不证明其他端口/域名也不可用。
- `ssh weaveops` 上只读 TCP 探测可连接该 HTTP 端口，路由经本地网关向公网地址转发。这证明可达，不能证明最后一段加密；SSH 到宁波再转公网 HTTP 不能当作安全通道。
- 未执行真实登录、真实报表采集、首次绑定、业务 DB 连接/迁移、真实账号写入或部署。未改变宁波、18443、18444 的服务/数据/配置。

## 本轮实现

旧 `source:ainuoke --check` 会校验业务 DB ledger 和已有操作人，无法在空账本初始化以前独立验证来源。新 `source:ainuoke:readiness` 只导入来源配置/采集器，不导入 DB pool、server config、migration 或任何领域 writer。

1. `--check`：校验私密 Linux 文件、来源 origin 和账号目标指纹。零网络访问、零 DB；不宣称账号有效或传输通道已核实。
2. `--probe`：必须显式指定 `--expected-source`，一次登录、最多三个固定报表首页：6086103 → 第一条可见合同的 6087105 → 其 InsideOrderNo 的 6087050。每页 50 行，不翻页、不重登、不网络重试，进程总上限 90 秒。
3. 输出只含固定报表 ID、返回/总行数、首页是否完整和读取状态。不输出合同、订单、用户名、密码、token、原始报表或异常文本；空 Discovery 下后二报表为 `not-probed`，不伪造成功。
4. HTTPS 使用正常 TLS、拒绝重定向/ambient proxy；公网 HTTP 被拒。字面量 loopback HTTP 另需 `--verified-tunnel`，该标记只是操作者确认，代码无法证明隧道后段安全。必须先独立核实终点及后段保护，不能把任意本地代理包装成安全来源。
5. 不校验织序操作人是否存在/有权，因为本命令不连接 DB；输出 `operatorAuthorization:not-checked`。后续真实首绑/发布仍由原 CLI 的可信 DB/RBAC/目标指纹守卫承担。
6. 不做完整合同覆盖、跨报表一致性、领域字段/单位核对，也不激活 Source。`READ_ONLY_CONNECTION_PROBED` 不是上线 PASS。现有 UI、默认关闭开关、生产路由、SQL 均不改。

证据路径：`server/ainuoke-source/readiness.ts`、`collector.ts`、`tools/ainuoke-bridge/ainuoke_bridge/server_source.py`、`server/integration/ainuoke-readiness*.test.ts`、`tools/ainuoke-bridge/tests/test_server_source.py`、`.github/workflows/ainuoke-server-source.yml`。

## 下一步与实际阻断

| 顺序 | 所需内容 | 完成条件 / 责任 |
| --- | --- | --- |
| 1 | 艾诺科 HTTPS origin，或终止于艾诺科服务器/可信内网的 SSH/VPN 通道 | 用户/艾诺科管理员提供地址与通道说明；核实证书、最终后段和敏感 query 不落日志。现在不需要密码。 |
| 2 | 来源凭据私下配置 | 在准备执行探测的 Linux 主机，由用户通过本地终端输入本人来源账号/密码，文件位于仓库外、仅执行用户可读；不发聊天、GitHub、argv 或环境变量。先 `--check`，核对指纹，再显式 `--probe`。 |
| 3 | 完整来源核对与首绑计划 | 首页探测通过后，另行核实完整合同范围、三报表字段和速率；提出明确空账本/操作人/备份/目标指纹/预览 hash 的计划。现有禁止真实 DB 写入继续有效，不能直接执行 bind。 |
| 4 | 持续四流与人工核对 | 在单独授权目标上首绑与持续采集；建议至少 24 小时、断网/重启恢复、四流各 3 张单据核对。时长/样本量为 AI 建议，不是已完成事实。 |
| 5 | 宁波上线 | 满足 D105，再核实完整镜像、ledger、域名/Origin/TLS、独立 DB/卷、备份恢复和回退，并取得具体部署授权。 |

已知产品缺口仍保留：首绑后新增合同不自动建单，主信息/颜色不增量刷新，完整分码 UI 未接线。持续调度当前仅覆盖已绑定订单四流；需要后续增量来源设计，不能按“所有合同自动跟随”验收。

## 私密操作说明（尚未执行）

私密文件使用现有严格键：`sourceKey`、`baseUrl`、`username`、`password`、`operatorUsername`。不要把真实值写进本文件。绝对路径、普通非 symlink 文件、属主为运行用户、权限 0600/0400、最大 16 KiB；Windows 不接受该私密文件流程。来源安全通道未证实以前不配置/发送真实登录凭据。

```text
npm run source:ainuoke:readiness -- --check --config=/private/source.json
npm run source:ainuoke:readiness -- --probe --config=/private/source.json --expected-source=<check的完整sourceFingerprint>
```

只有字面量 loopback 且已独立核实端到端通道时才添加 `--verified-tunnel`。生产构建可使用 `node dist/server/server/ainuoke-source/readiness.js`；本轮未安装到真实服务器。上游登录协议使用 GET query 传递凭据，终端/代理/服务器访问日志必须避免保存敏感 query。密码轮换不改账号目标指纹；换 origin/账号/sourceKey/操作人必须重新核对。这个 source 指纹不等于原绑定命令含 DB 的 targetFingerprint。

回退：撤回本轮 CLI/测试/文档即可，不需要数据回退；后续真实探测失败只停止，不自动换源、放宽 TLS 或写 DB。合成回归与复审结果见本目录 `evidence/ainuoke-live-readiness/engineering.md`。
