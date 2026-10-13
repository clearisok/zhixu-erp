# AI handoff

核实2026-10-13；最新 main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`（用户授权合并PR107已完成）。本工作树 `ainuoke-live-demo-readiness` / `feat/ainuoke-live-demo-readiness` 起点同完整SHA、tracked/untracked干净。先读AGENTS、PROJECT_INDEX、CURRENT_STATE及[本轮任务](tasks/active/ainuoke-live-demo-readiness.md)，再核实实际GitHub/HEAD/diff。旧恢复记录完整[归档](tasks/completed/2026-10-13-pre-live-demo-status-snapshot.md)，不再把旧“#104/105/106/107未合并”当当前事实。

本轮只做无DB全量来源预检、私密终端stdin与受保护ignored报告、只输出计划的隔离目标和合成测试。本机22项预检、root817、基线71、Python69、Source20PASS/1skip、continuous43PASS/1skip及类型/lint/Server/UI build通过。G1 checkpoint为87b97d73f5dd77ea8e23543b2524fb22dc5836cb，已前向冻结D113/新能力证据。安全推送超时，NETWORK_DEGRADED，REMOTE UNVERIFIED；最终精确SHA/唯一PR/CI待恢复核实。[本机复审](tasks/active/evidence/ainuoke-live-demo-readiness/final-local-review.md)。真实全量读取、首绑/调度写入、候选创建/启动均未执行；不能读取 `D:/workspace/ainuoke-key.txt` 到Codex上下文。用户在私密终端显式运行工具，助手只核对脱敏JSON/受限私有业务报告。

约束：原UI/正式数量/去重/单位公式/SQL/default flags不改；真实账号/业务数据库/宁波/18443/18444不操作；本PR不自动合并。用户正在填写Excel，不覆盖、不导入。持续来源尚未激活，不能把代码/合成测试/只读预检升级为真实展示或人工验收。后续新隔离目标执行需要具体可审查的计划与授权。网络失败按AGENTS，LOCAL ENGINEERING/REMOTE DELIVERY分别记录；不换认证、不force/reset/clean。更新时机：可靠Gate、交付、真实回执或授权变化。
