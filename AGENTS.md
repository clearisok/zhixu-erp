# Codex 永久工作规则

本文件适用于整个仓库。目标是让任何新的 Codex 会话都能仅依靠仓库恢复项目认知，而不依赖聊天记录。

## 每次任务的必读顺序

1. 读取本文件。
2. 读取 `docs/PROJECT_INDEX.md` 和 `docs/CURRENT_STATE.md`。
3. 检查当前分支、`git status` 和相关文件的未提交差异；不要覆盖或回退用户已有改动。
4. 按 `PROJECT_INDEX` 读取任务相关的 feature 文档、`docs/BUSINESS_RULES.md` 和有关的 `docs/DECISION_LOG.md` 条目。
5. 修改前检查实际代码、数据库脚本、API 和测试。不得只根据文档或 conversation history 推测实现。

## 事实来源优先级

发生冲突时，按以下顺序核实：

1. 当前工作树中的可执行代码、数据库约束/初始化脚本和实际测试。
2. 与当前代码同步的 feature 文档、`CURRENT_STATE` 和明确标为 Active 的决策。
3. README 和其他说明文档。
4. 历史审计、迁移计划和聊天记录。

聊天上下文不是项目事实的永久存储。上下文被压缩、切换 conversation 或出现不确定信息时，必须回到仓库查证。

## 修改规则

- 先理解现有实现，再设计或修改；不要绕过已有组件、repository 或业务边界另起一套实现。
- 不擅自改变 `docs/BUSINESS_RULES.md`、feature 文档或 Active 决策中已经确认的业务规则。若需求与其冲突，先指出冲突并取得用户确认。
- 严格区分根路径 ERP 与 Quote Center。两者当前具有不同的数据模型、计算口径和持久化方式，不得因为名称相同而混用接口或公式。
- 不得删除、覆盖或破坏现有业务数据。执行恢复、清库、删除 volume、批量迁移或其他不可逆操作前，必须明确目标、备份和用户授权。
- Quote Center DEV 浏览器数据是长期验收数据。修改任何 browser Repository、Seed、Storage key、schema 或 IndexedDB 前必须先读 `docs/features/DATA_LIFECYCLE.md`；只允许向前、幂等、非破坏迁移，禁止以换 key、静默 Seed 或测试全局 clear 处理旧数据。
- 保留 dirty worktree 中与当前任务无关的改动；禁止用破坏性 Git 命令清理工作区。
- 业务行为变化时，同步更新对应的 `docs/features/*.md` 和必要的测试。
- 新的重要架构或业务决定写入 `docs/DECISION_LOG.md`，标明日期、状态和代码证据。旧决定不直接删除，应改为 Superseded 或 Deprecated 并说明替代项。
- 大型任务完成后更新 `docs/CURRENT_STATE.md`。它只描述当前状态、风险和下一步，不堆积开发流水账。
- 每个 Delivery Phase 必须独立完成版本控制收口：开始前记录 Branch、HEAD 与工作树 baseline，结束后只 stage 本 Phase 增量并创建独立 commit，最终报告 commit hash。若增量与继承 dirty hunks 无法安全隔离，必须停止提交并先完成明确的 baseline reconciliation，禁止猜测拆分历史。
- 新增模块时，只有当模块复杂到需要独立恢复上下文时才新增 feature 文档；不要创建空壳文档。

## 数据库与 API 规则

- 当前没有 Alembic 或 Python 后端。不要把 `database/*.sql`、空的 Drizzle/D1 scaffold 或聊天中的未来方案描述成已经存在的 migration/backend。
- 修改 PostgreSQL schema、`api_dispatch`、初始化管理员或备份恢复流程前，先阅读 `docs/features/LEGACY_ERP.md`、相关 SQL 和脚本。
- Quote Center 默认 Browser 使用 mock repository、稳定 localStorage namespace 与 IndexedDB；显式 Server authority 使用 Node `/api/v1/quotes`、可信 session/RBAC 和 PostgreSQL，绝不回退旧 Browser 数据。根路径 legacy `/api/quotes` 不是新 Quote 接口。旧真实部署与最新工程能力分开记录，不擅改默认值或清理旧数据。
- 按可使用的发布范围组织任务；工程验收、候选构建、真实部署和用户人工业务验收分别记录。延期功能不自动成为首次试用前置。CURRENT_STATE 约一页，AI_HANDOFF 只保留当前恢复点；历史证据归档到 docs/tasks/completed 并维护链接，不删除日期、hash、结果和限制。

## 验证与交付

- PR 交付前运行 `npm run check:release-baseline -- --base-sha <本次核实的main完整SHA>` 与 `npm run test:release-baseline`。清单/当前状态使用同一基线，历史部署与截图保留各自日期/source SHA。
- UI 文件变化须按 `docs/features/RELEASE_BASELINE_GUARD.md` 提交本PR的精确路径影响记录；V2/V3先有明确用户批准。不得自动更新截图哈希消除失败；检查通过不代表人工认可或部署授权。
- 基线/权限/来源/运行环境事实发生变化时，由一个整合者对齐共享状态摘要；旧日期/hash/结果/限制归档保留。完整浏览器像素/数据库/发布验收不能由此最小源码门禁替代。

根据改动范围执行最小充分检查。涉及 TypeScript/React 的通常检查为：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

数据库或容器相关改动还应执行对应的 SQL、API、Docker 或备份恢复验证；若环境限制导致无法执行，必须如实记录，不能写成“已通过”。

完成任务前检查：

- 实现与现有业务规则一致。
- 没有误改无关文件或用户数据。
- 相关测试和质量检查已执行并记录结果。
- feature 文档、CURRENT_STATE、DECISION_LOG 按规则同步。
- 最终汇报区分“已确认事实”“推断”“未验证/已知问题”。

## GitHub 交付协议

本仓库远端：

- Repository: `clearisok/zhixu-erp`
- Remote: `origin`
- Default branch: `main`

除非用户明确要求，否则：

1. 不直接在 `main` 上实施大型业务任务。
2. 每个任务从最新 `origin/main` 建立独立任务分支：
   - `feat/<task-slug>`
   - `fix/<task-slug>`
   - `chore/<task-slug>`
3. 不得因为当前分支或工作树与预期不同而 reset / clean；先分析差异。
4. 每完成一个重要、可以独立验证的 Gate：
   - 更新必要的测试；
   - 更新 `docs/AI_HANDOFF.md`；
   - 创建 checkpoint commit；
   - 网络通道正常时安全 push 当前任务分支一次，并核实精确远端 HEAD；NETWORK_DEGRADED 时只保存本地 checkpoint，不在后续 Gate 重复撞同一通道。
5. 多 Gate / 长时间任务不得把全部进度只留在未提交 working tree 中。每个重要 Gate 必须有可靠本地 commit 与短接力；独立记录 LOCAL ENGINEERING / REMOTE DELIVERY，不冒称 GitHub 已送达。已知继承 dirty 仅在内容/完整哈希已核实并保护时可继续；不能将其纳入本阶段提交，未知 dirty 仍 STOP。
6. 最终 Gate PASS 后：
   - 更新 CURRENT_STATE；
   - 更新相关 feature docs；
   - 更新必要的 DECISION_LOG；
   - 更新 AI_HANDOFF；
   - 完成最终 commit；
   - 正常通道安全 push 一次；NETWORK_DEGRADED 则提供一次性人工交付命令；
   - 精确远端代码已核实后才创建或更新 Pull Request 到 `main`。未交付的新代码不得写成 REMOTE DELIVERY PASS。
7. 不自动 merge `main`。
8. 不 push：
   - secrets
   - `.env`
   - 真实业务原始 Excel（除非明确批准）
   - backup
   - 临时 audit
   - node_modules
   - tsconfig.tsbuildinfo
   - DEV 私有缓存
9. 最终报告必须给出：
   - branch
   - commit hash
   - PR number / URL（若创建）
   - tests
   - remaining dirty

### GitHub 网络故障恢复（2026-10-09 用户授权，立即适用）

1. 正常每个可靠 checkpoint push 一次，最终核对远端 SHA 并创建/更新唯一 PR。纯网络错误不无限重试、不在每个小步骤再次撞远端。
2. Connection reset / connect / TLS timeout / Schannel transport EOF / missing close_notify 等不确定传输失败：本轮进入 **NETWORK_DEGRADED**，保存本地 commit 与接力，不在后续 Gate 反复 push 同一失败通道；即使精确远端核实已送达，也不据此宣称通道长期恢复。允许同一已验证基线、不依赖远端的安全本地阶段继续。工程通过与远端交付分别报告；真正依赖远端的 PR/合并/部署动作等待交付核实。**不因此授权真实部署或数据库操作。**
3. 结果不确定时允许一次只读核实；远端为 exact full target SHA 时确认已送达，不盲推；不能核实时记 REMOTE PENDING，不假报成功。PR 创建 EOF/timeout 先查 head 已有 PR，不换标题重复创建。
4. 起始 fetch 失败仅在用户/可信来源核对的完整 baseline commit 在本地、对象/工作树可验证时继续，注明本次未刷新远端；缺对象仍 BLOCKED，不能退用旧分支猜基线。
5. authentication/permission denied、rejected/non-fast-forward、分歧、冲突、证书信任/身份异常、未知 dirty 停止相关执行并保护现场。不 force/reset/clean/自动 rebase，不关闭证书验证。不因网络故障覆盖业务工作树，不使用 GitHub 文件 API 伪造原始 commit 的交付。
6. 不输出 token/Authorization/Cookie/代理密码/credential helper 内容，不读取 gh auth token / git credential fill，不上传 raw trace；网络原因区分 confirmed/suspected/unresolved。共享 common-dir/全局代理/SSH/TLS 配置不得擅改；仅有界进程级对照，持久修改需证据与另行确认。
7. 首选 `scripts/git-delivery.ps1`：指定 Worktree、任务 Branch、ExpectedHead 完整SHA；默认Dry Run，实际推送须显式 `-Execute`。校验仓库/分支/dirty/远端祖先关系，远端已精确相同不重推；正常push至多一次，无论退出码如何都独立核实远端。DELIVERED_VERIFIED才是送达；LOCAL_PASS_REMOTE_UNVERIFIED不是工程失败或交付PASS。正常PowerShell备用路径运行工具给出的**一条**安全恢复命令，不要求用户拼装多条Git命令。不自动执行恢复命令或更换认证方式。脱敏对照用 `scripts/git-delivery-diagnose.ps1`，只读且不push。工具要求PowerShell7.2+/Node22.13+/Git，gh提供独立API核验；缺运行时STOP，不擅自安装或更改共享环境。
8. 本协议适用于所有Codex执行者（默认一个主Codex，可选分工），不得各自发明恢复方式。工具使用/限制及历史诊断见 `docs/tasks/active/git-delivery-resilience.md`；分类及临时Git/裸仓库回归见 `scripts/__tests__/git-delivery-state.test.mjs` 和 `scripts/__tests__/git-delivery.test.mjs`。普通用户PowerShell对照未完成时，执行环境差异与根因仍明确标为未验证。
