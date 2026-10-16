# GitHub 网络恢复及 PR113 首轮 CI 修复

核实日期：2026-10-16；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。本 Phase baseline 为干净的 `feat/ainuoke-payment-controlled-collector@4622d6d300f73171aa5f9ab35f25f0b680d03515`，继续原 worktree，不新建或覆盖分支。证据、网络路径、源码、授权或 CI 状态变化时更新；GitHub 是实时事实源，本文件为阶段快照。

## 已确认事实

- 默认解析：github.com=172.182.252.133，api.github.com=172.182.252.137；hosts 无 GitHub 覆盖，另一 DNS 查询也返回同一 github.com 地址。两地址均由 GitHub 官方 `/meta` 公布，不能据此称 DNS 污染。
- Node 与系统 curl 独立测得 github.com 的 TCP 及 TLS 成功、证书有效，但 HTTP 12 秒未响应；同机 api.github.com 与 Microsoft HTTPS 正常。不是只停在本地预检，也没有证据证明凭据错误。
- 对照官方 `/meta` 四个 web 地址并保持 github.com 域名/SNI/证书校验：三个仍超时；20.200.245.247 返回 Git endpoint HEAD 405（该检查只说明 HTTP 已响应），随后真正 Git `ls-remote` GET 成功，2609ms。
- 仅在本次子进程追加 `http.curloptResolve=github.com:443:20.200.245.247`，使用原安全交付工具、原远端及原认证；实际 push 一次，7351ms，独立 GitHub API 与 connector 均核实远端完整 SHA 4622d6d300f73171aa5f9ab35f25f0b680d03515。
- 已创建并附加唯一[草稿 PR #113](https://github.com/clearisok/zhixu-erp/pull/113)。相对 main 的 520 文件为累计依赖差异，不能当作独立小补丁直接合并。

官方来源：[服务地址元数据](https://api.github.com/meta)、[连接故障排查](https://docs.github.com/en/get-started/using-github/troubleshooting-connectivity-problems)。本机脱敏证据保留在被 Git 忽略的 `outputs/github-network-layer-result-20261016.json`、`github-official-endpoint-result-20261016.json`、`payment-collector-recovered-delivery-20261016.json`；不提交原始网络 trace 或凭据。

## 原因的证据边界与安全修复

已确认当前默认地址路径的 HTTP 不响应，而另一官方地址可完成 Git 读写。具体是运营商、中间设备还是边缘路由的原因，客户端证据尚不能区分。不能称默认网络已永久恢复，或把问题归因于 Codex、PowerShell、Schannel、证书或认证。

修复为进程内地址选择，进程结束即失效。没有修改系统 DNS/hosts、全局或 common-dir Git/代理/TLS、远端 URL、认证方式或证书校验。以后需要同类恢复时，重新通过 HTTPS 获取官方 `/meta`、验证候选地址与实际 Git 读取；不长期固定本报告 IP、不扫描任意地址、不关闭 TLS、不换镜像或认证、不上传 token。仍由原 `git-delivery.ps1` 检查仓库/分支/完整 HEAD/dirty/祖先关系，最多一次 push 并独立核对。网络错误不无限重试，原 AGENTS 恢复规则没有删除。

## 首轮 Hosted CI 的具体失败与修复

4622d6d 的 baseline 成功；[Source 任务](https://github.com/clearisok/zhixu-erp/actions/runs/38833964524)在 identity 升级测试失败，旧预期到0023，真实仓库已存在0024/0025。[Team 任务](https://github.com/clearisok/zhixu-erp/actions/runs/38833964394)的登录测试仍找旧“退出 Server”按钮；用户已批准改为右上角用户菜单内的“退出登录”，导致退出失败及下一条恢复测试连带失败。这些不是部署或真实数据故障。

本 Phase 只改测试/CI/工程文档：共用显式审定的 `server/integration/current-migration-ledger-fixture.ts`，严格列出当前24个 SQL 文件（版本13本就不存在），各新建/升级测试比较全量或起始版本后的精确列表，仍保留数据/权限/幂等/完整性断言。没有用实际目录动态生成预期来放过未知迁移；未来新增 SQL 仍必须更新审定清单。Source CI 补入此前遗漏的物料设置后端回归。登录回归通过已批准的“用户菜单→退出登录”真实会话入口验证失败后重试；未改页面或交互实现。

本地已完成：升级/历史/准备/设置/财务存储/空启动109/109，完整 PostgreSQL261/261，类型与定向lint通过，发布基线94/94。新登录浏览器回归、精确最终提交门禁及新 Hosted CI 尚待实际结果；首轮失败不删除或改称通过。此前受控采集22/172、root898及精确构建证据仍按其原提交阅读，不冒称本 Phase 全部重跑。

## 用户决定与当前限制

用户明确授权调查、可安全修复及继续本分支交付/唯一草稿 PR/CI/复审；没有授权自动合并、部署、真实账号或业务库操作。原财务报表读取次数及四单窗口不扩大或重启。未执行真实上游读取、Source绑定、目标启用或真实迁移。最终合并建议须以新精确 head 的三项 CI、累计依赖及复审结果为准，不由本文件的旧状态替代。
