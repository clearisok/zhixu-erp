# Codex 操作 GitHub Projects

仓库：`clearisok/zhixu-erp`；Project：[用户 clearisok 的 Project #1](https://github.com/users/clearisok/projects/1)。先读根 AGENTS.md、PROJECT_INDEX、CURRENT_STATE、本目录 [WORKFLOW](WORKFLOW.md)，再处理对应 Issue。不要创建替代 Project，不调整用户现有字段、视图或自动化。

## 开始工作

1. 读取当前分支/HEAD/dirty、AGENTS 和相关规范；保护其他工作，独立任务分支从经核实的 main 起步。
2. 核对 GitHub 身份、仓库权限和 Project 访问。`gh auth status` 不加 `--show-token`，禁止读取/输出 token、凭据助手内容或 Cookie。
3. 查找关联 Issue、开放 PR、子任务和最新批准记录，避免重复需求或重复开发。旧 Issue #96 是历史汇总，不自动拆分或关闭；已有 PR 不因新管理体系自动合并。
4. 读取 Project 实际字段、Status 选项及当前项，核对生命周期与用户授权。**状态不是授权**，Codex 不得自批。
5. 将本轮范围、方案版本、用户决定证据与恢复点追加到 Issue；重要 Git checkpoint 及验收证据链接回填。受权限限制时本地保存待回填记录，明确尚未写入 GitHub。

## 最小权限与读取示例

```powershell
gh auth status
gh api repos/clearisok/zhixu-erp --jq '{default_branch,permissions}'
gh issue list --repo clearisok/zhixu-erp --state open --label product
gh pr list --repo clearisok/zhixu-erp --state open
gh project view 1 --owner clearisok --format json
gh project field-list 1 --owner clearisok --format json --limit 100
gh project item-list 1 --owner clearisok --format json --limit 100
```

超过单页必须继续分页，不能把首 100 项称为全部。使用 GraphQL 时检查 errors、hasNextPage/endCursor；API 权限不足不等于 Project 不存在。Project ID、字段 ID、option ID 每次从真实读取结果取得，不把示例值或过期缓存写入命令。

经典 OAuth CLI：只读 Project 至少需 `read:project`；执行已授权状态更新需 `project` 读写范围。细粒度凭据需账号下该 Project 的相应读/写权限，Issue/PR 则需目标仓库对应权限；不要求无关 admin、delete_repo 或部署权限。发现不足时说明受阻操作与最小范围，用户自行授权；Codex 不自动刷新授权、切换账号或扩大 token 范围，不索取/保存秘密。

## 日常自然语言

| 用户可以这样说 | Codex 应执行 |
| --- | --- |
| “记录新想法：订单页希望增加……” | 查重后新建独立 Issue，保留原话，加 product/idea，核对自动进入 Idea；不开发 |
| “列出全部 Idea” | 读取并分页 Project，按 Status 精确筛选 Idea，给出编号/标题/优先级/最近更新；不改状态 |
| “调研 #123，不开发” | 记录只读范围，进入 Research，提交有证据的调研及重复/依赖/风险 |
| “给 #123 生成实施方案” | 进入 Design，给出完整版本化方案，等待用户批准，不写业务实现 |
| “哪些需求等我审批？” | 列出 Design 待实施批准、Review 待验收、待部署授权及受影响的新版本；依据 Issue 决策核对，不能只靠状态 |
| “批准 #123 方案 v2，按其中本机范围开发” | 记录用户原始决定与 v2 链接/哈希，核对限制，Ready→In Progress；不推定批准 staging |
| “开发已授权的需求 #123” | 先核验具体有效批准记录，范围一致才实施；缺授权仅提出缺失事项，不自批 |
| “汇总本周研发进度” | 明确 Asia/Shanghai 日期范围，汇总 Issue/PR/测试/验收/部署证据，区分完成、待审与阻塞；不因报告改状态 |
| “检查需求遗漏、重复和长期搁置” | 对照 Issue、Sub-issues、PR、仓库待办及批准记录，提供差异和建议，不擅自关闭/拆分/迁移旧事项 |

已有授权持续有效，不为每个内部步骤重复提问；超出已批准业务、数据或部署范围则需具体确认。用户聊天授权由 Codex 明确转录，绝不伪装用户评论或用 AI 自己的方案/批准代替用户决定。

## 写操作与恢复

- 一个真实需求一个 Issue；用结构化 body 或 UTF-8 `--body-file` 提交，避免 shell 插值。Project 自动加入只由 product Issue 规则处理；真实自动化故障先记录，未经用户同意不改自动化。测试不手动加卡掩盖。
- 仅在具备证据且已授权时更新对应项的 Status；写前后复读精确 item/field/option，不能批量猜改。标签和 Work Type 是分类，不是状态或批准。
- 无最终验收前使用 `Refs #123`，不用关闭关键词或 GitHub 的自动关闭关联；PR 合并与最终验收分别记。
- 子任务引用父项及依赖，批准范围不因拆分扩大。所有调研、方案、决定、提交、测试和部署均回链对应 Issue。
- 网络/权限异常保留本地 checkpoint 与待回填清单，按根 AGENTS 的有界交付协议处理；避免不确定结果下重复建 Issue/PR。先查远端是否已创建，不能制造重复项。
- 不新增后台自动开发、自动合并或自动部署。日常整理是用户发起的操作，本规范本身不创建定时任务。

验证记录见 [2026-11-17 接入审计](AUDIT-2026-11-17.md)。
