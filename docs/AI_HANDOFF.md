# AI handoff

核实2026-10-13；最新 main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`（用户授权合并PR107已完成）。本工作树 `ainuoke-live-demo-readiness` / `feat/ainuoke-live-demo-readiness` 起点同完整SHA、tracked/untracked干净。先读AGENTS、PROJECT_INDEX、CURRENT_STATE及[本轮任务](tasks/active/ainuoke-live-demo-readiness.md)，再核实实际GitHub/HEAD/diff。旧恢复记录完整[归档](tasks/completed/2026-10-13-pre-live-demo-status-snapshot.md)，不再把旧“#104/105/106/107未合并”当当前事实。

本轮只做无DB全量预检、受保护ignored报告和plan-only隔离目标。初版HEAD `8d37ed06f80b0596736b1e5b8af712ee700d987d`的22项/root817/基线71/Python69/Source20PASS1skip/continuous43PASS1skip及构建已过；用户后回传三次FAIL/readonly_worker_unavailable，三个目录无文件。固定operatorAuthorization状态误拦截与错误遮蔽已复现/修复，最新24项和类型/增量lint通过；本阶段仍同分支、起点8d37干净。D113/新证据需本修复checkpoint前向绑定，root/基线/Server build最终收口见[修复证据](tasks/active/evidence/ainuoke-live-demo-readiness/operator-wrapper-repair-2026-10-13.md)。不能凭失败推断上游零请求或完整读取；真实全量回执、首绑/调度、候选均未完成。用户要求用既有凭据文件后仅收紧其ACL至原所有者/SYSTEM，助手未读内容；操作命令加CredentialFile免输入。密码不进Codex。GitHub交付NETWORK_DEGRADED，分支未送达/无PR；不重建/重复PR/撞远端，最终精确SHA/CI待恢复。

约束：原UI/正式数量/去重/单位公式/SQL/default flags不改；真实账号/业务数据库/宁波/18443/18444不操作；本PR不自动合并。用户正在填写Excel，不覆盖、不导入。持续来源尚未激活，不能把代码/合成测试/只读预检升级为真实展示或人工验收。后续新隔离目标执行需要具体可审查的计划与授权。网络失败按AGENTS，LOCAL ENGINEERING/REMOTE DELIVERY分别记录；不换认证、不force/reset/clean。更新时机：可靠Gate、交付、真实回执或授权变化。
