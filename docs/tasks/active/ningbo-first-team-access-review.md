# 宁波首批团队接入：合并前本地复审

核实日期：2026-10-12；main：01694d723cd7b65fcc20e3e79941fef0d57439fc。
代码提交：72b025343c2e0d5f13f0652c04e37b5c5051a20e；之后仅补冻结清单和审查/交付文档。复审为同一任务的独立检查步骤，不冒称外部人工审查。

## 结论

本地范围内未发现P0/P1阻断问题，可交付PR等待CI。**目前不建议执行合并**：历史预检曾NETWORK_DEGRADED、pushes=0；2026-10-12经只读对照后，主Codex自有PowerShell单次推送206768e107bcd6402983f74adc9f002a5fbd757a已获exact SHA核验。PR对应最终head的CI仍需完成，实时结论见GitHub PR。精确head送达、PR两项CI通过且用户确认功能范围后，可建议合并工程代码；部署与人工业务验收仍另行授权。

## 核查证据

| 核查项 | 结论和证据 |
| --- | --- |
| 身份与越权 | endpoint只接受session、可信view/manage；事务重查active/权限；匿名401、普通五角色403、伪造/CSRF/错误Origin均拒绝。team-access.integration.test.ts |
| 数据/密码 | 无SQL/migration/真实DB；沿用pgcrypto；正文16KiB上限、bcrypt72字节限制；public DTO无秘密；审计同事务。客户端错误不回显raw错误 |
| 并发/恢复 | 同版本并发一200一409；重复创建不覆密码；漂移角色不覆盖；改角色/停用/重置撤会话；最后管理员及自锁保护；未知网络结果不自动重试 |
| 权限矩阵 | 六实际session分别验证quote创建和商业金额读写；不靠UI隐藏；既有Session/commercial/cost安全回归通过；Source读取授权不等于Source接通 |
| UI | shared原用户权限布局，CSS/断点未改；新建和重置仅既有Modal，手机沿用Bottom Sheet；production build Chromium实测，无Browser权限存储 |
| 环境/范围 | diff无database/SQL、部署脚本或Deploy Production workflow修改；新CI只在ubuntu-latest临时PG/Chromium跑，不用宁波self-hosted runner；无真实账号/SSH/部署 |
| 基线可靠性 | 旧证据ID/hash保留；D-104新文档使用supersedes前向绑定72b0253 blob；新能力九项、页面十项；没有把合并/部署/人工/Source状态抬高 |
| 知识恢复 | CURRENT_STATE/PROJECT_INDEX/AI_HANDOFF同main锚点；旧全文归档；新规则和真实未激活边界写入PERMISSIONS/BUSINESS_RULES/D-104 |

## 测试

- typecheck、server:build、lint PASS。
- npm test：807/807 PASS（包含69项发布基线/响应式用例）。
- 客户端+六角色API+既有Session/商业授权/成本安全：31/31 PASS。
- production Server/session Chromium：5/5 PASS，重复运行通过；默认Browser构建及显式Server构建PASS，保留已有bundle大小提示。
- check:release-baseline --base-sha完整main：PASS，10 pages、9 capabilities、6 changed UI files。test:release-baseline独立命令结果在任务最终记录。
- CI：本快照写入时待运行；PR实时最终head状态为准，不能用本地PASS代替。

## 非阻断限制 / 后续

1. GitHub main API显示protected=false，required checks未启用；这是既有仓库治理缺口，不是本PR新缺陷。本任务不擅改仓库规则；建议管理员把Release baseline与First team access设为必需，并禁止直接push。
2. 目前管理者/财务只读金额，物控无织序金额，生产工价只读；未接模块保持关闭。未来真实业务反馈若要改矩阵，须明确决定、测试及前向角色升级，不覆盖既有自定义授权。
3. 本版没有邀请/自助忘记密码/强制首次改密；初始管理员和真实密码通过用户私密运维步骤设置，不能把合成密码用于真实环境。
4. 宁波旧版兼容、反代HTTPS/Cookie/Origin、独立新账本和回退尚未验证；不能据此PR直接部署。Ainuoke覆盖范围仍是用户陈述，Linux受控来源接线未实现。
5. 自动截图是候选工程证据，不是新人工视觉基线，也不是完整像素回归。截图构建发生在72b0253创建前，实际源码与该提交相同，build-info仍显示起点01694d7；它不是运行环境部署身份。
6. Windows本地Chromium已验证；新增Ubuntu CI的runner/Chrome可用性以实际CI为准，不预报通过。

更新时机：远端exact head/CI/新代码/人工验收变化。合并后状态由新任务核对main再更新，保留本次证据。
