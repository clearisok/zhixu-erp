# PR160正式验收与交付收尾（2026-11-20）

## 用户决定与本轮边界

Codex转录当前聊天用户原话：“我认可本次 Staging 自动同步恢复及订单删除功能的验收结果。”用户明确授权PR160 Ready/正式合并、Issue159与Project收尾、当前状态和接力更新，并要求提出最小影响代理长期方案。不重新部署Staging、不重启Worker、不操作Production或业务DB、不重复同SHA已通过且无影响的完整测试、不开始新功能。

本轮初始feat/ainuoke-source-deleted / e833b819f653f27b3448e447795864693a0a6568，clean；远端相同。main经GitHub API和实际Git fetch核实636a5ad0d2d1acbe6b2705696e782dea12ee9f00。没有reset/clean/force/rebase、移动其他工作树或丢弃历史。

## PR160正式合并

- [PR160](https://github.com/clearisok/zhixu-erp/pull/160) 已从Draft转Ready，按正常merge commit合并。
- 合并受审HEAD：e833b819f653f27b3448e447795864693a0a6568；GitHub expected_head_sha锁定，无新增未审代码。
- merge/main代码整合SHA：**4e1f9a514c8ff6e9cf7289d724df33c32bc05368**，API与Git fetch一致，受审e833为其祖先。
- 合并前GitHub CLEAN/MERGEABLE，review0、未解决thread0；main无branchProtectionRule，实际branch rules为空，未移除/绕过保护、审批或检查。仓库允许merge/squash/rebase，沿main既有双亲merge方式保留完整检查点。
- [Release baseline](https://github.com/clearisok/zhixu-erp/actions/runs/44741932219)、[First team access](https://github.com/clearisok/zhixu-erp/actions/runs/44741932341)、[Source](https://github.com/clearisok/zhixu-erp/actions/runs/44741932214/job/136307483431) 全部绑定e833并真实success；Source服务器/迁移、质量、候选构建、Chromium与Python均成功。旧dfcd cancelled独立保留，不算通过。
- Production安全核实：main与候选五个workflow中生产部署deploy-production.yml、生产runner-smoke.yml均只有workflow_dispatch，其他仅pull_request/workflow_dispatch；无push、workflow_run或合并自动部署入口，活动repository Webhook为空。PR仅增加source_deleted的两条CI测试命令，没有改变生产触发器。没有调用任何dispatch或生产主机操作。

## Staging及订单删除验收

实际部署仍 **0752d64f309d68b6e52afbbd712d28e0d9db9c1e**；本轮Git合并没有改变运行版本或重新取证业务库。已有九Gate、真实heartbeat、两轮255+255共510/510成功，142原失败完整保留、正常订单继续调度。两合同PI2611-142/SO629、PI2611-143/SO630分别source_deleted/version1、数量10000/8000；2条不可变删除事件及全部历史保留，不产生新自动任务。原正常来源过期橙色、单位为空紫色及独立异常保留。

0060是前向迁移，不将旧不可见直接回填为删除；确认删除/恢复仍需真实完整目录证据及唯一BillNo。原Price有限重采、未知结果人工复核、身份/范围/分页保护和30分钟策略不变。[完整恢复/备份/逐单证据](../active/staging-selected-source-recovery-2026-11-20.md)、[生命周期实现与分阶段验收](../active/ainuoke-source-deleted-2026-11-20.md)保留原日期/source SHA/结果/限制。

助手先前本机四桌面分辨率/两角色真实Chrome隔离回归通过；Staging登录后像素截图曾受浏览器工具kernel assets错误阻塞，这个历史事实不改写为通过。本次最终Staging UI/业务验收依据为用户明确认可，不能冒称助手新增截图。

Issue161已在e833精确送达及三CI成功后Done/关闭。[Issue159最终用户验收及合并回执](https://github.com/clearisok/zhixu-erp/issues/159#issuecomment-7042509186)记录后，按实际Project字段Staging→Done并完成关闭。Issue/Project状态与部署、工程、用户认可分别记录。

## 文档收尾与稳定基线

本轮文档分支chore/pr160-acceptance-closeout从main **4e1f9a514c8ff6e9cf7289d724df33c32bc05368**、clean建立。只更新当前三入口、相关feature/恢复任务的最终阶段记录及release manifest基线锚点；冻结的D198决策和同步审计业务契约逐字保留，由本收尾记录前向补充验收与授权；不改UI、服务端、SQL、脚本或workflow。三个原摘要字节归档于[合并前状态](2026-11-20-pr160-before-final-acceptance/CURRENT_STATE.md)，历史任务不删除、旧失败原因不伪造。

已有0752/e833完整测试不手动重跑。本阶段只做新增文档链接、diff和对新main精确锚点的release guard/182项相关基线回归。首次guard识别source-deleted-decisions-20261120与source-deleted-contract-20261120冻结证据漂移，因此按manifest实际路径docs/DECISION_LOG.md与docs/features/AINUOKE_SYNC_AUDIT.md，撤回本Phase对两份冻结文档的页首插入，保留原文和hash，以本独立收尾记录及当前索引前向补充；不自动更新旧证据hash。文档PR如由仓库自动触发CI，其结果只归属于自己的HEAD，不借用e833或0752成功。文档最终commit/PR/最新main完整SHA通过精确Git交付和GitHub收尾评论记录，避免在文件内伪造自引用commit。下一任务先fetch origin/main并核实远端，再从该完整SHA建独立分支；其他worktree的旧本地main不擅自移动。

## Git代理长期方案（仅提出，尚未持久修改）

已证实GitHub专用全局Git代理曾指向127.0.0.1:17989，该端口不可达；运行中的XingchenCore实际HTTP代理127.0.0.1:7888。通过7888只读ls-remote成功；同一正式git-delivery只在子进程覆盖GitHub代理，一次push exit0并由独立API精确确认e833。当前节点当时可用，不能由此承诺以后节点永不超时。历史只有uncertain_transport摘要的失败不能倒推为相同唯一根因。

推荐最小持久方案：用户单独批准后，先确认星辰VPN客户端将HTTP端口稳定配置为7888，再只在本仓库local添加GitHub专用 `http.https://github.com.proxy=http://127.0.0.1:7888`。先保存该local键原值和来源，确认TCP、只读Git身份与准确远端；修改后再只读核实，不以测试为名push。该仓库common-dir为D:/workspace/preparesystem/.git，所有关联worktree共用local配置，因此影响仅本仓库及关联worktree，仍须明确确认；不会修改其他仓库/全局网络、认证、TLS或VPN节点。若原local键不存在，回退只移除本次新增local键；若存在则恢复原值，不直接覆盖其他配置。回退后旧全局17989可能再次阻断，必须如实告知。

无需持久变更的替代方案：在已确认7888可用时，继续只为官方交付脚本的子进程提供 `GIT_CONFIG_COUNT/GIT_CONFIG_KEY_n/GIT_CONFIG_VALUE_n` 的GitHub专用覆盖，进程结束即失效。正式脚本和ExpectedHead不改，仍只允许一次push、独立远端核验。不要通过关闭TLS、换认证、清代理全局键、修改Docker代理或不断换节点掩盖端口不匹配。

本轮没有执行上述持久配置方案；不新增自动网络修复或后台代理监控。

## 保留风险

原selected_source_invalid失败raw缺失，具体坏行/字段仍无法还原；两个自然周期不代表永不再触发保护。生产完全不在本次操作范围。真实库/备份和配置保留原受控位置，不提交秘密、原始业务导出或失败包。共享旧代理仍待用户批准长期修正，普通Git命令可能继续命中失效17989；单次成功不冒称全局已修复。
