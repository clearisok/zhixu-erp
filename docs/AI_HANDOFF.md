# AI handoff

核实2026-10-13；最新 main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`（用户授权合并PR107已完成）。本工作树 `ainuoke-live-demo-readiness` / `feat/ainuoke-live-demo-readiness` 起点同完整SHA、tracked/untracked干净。先读AGENTS、PROJECT_INDEX、CURRENT_STATE及[本轮任务](tasks/active/ainuoke-live-demo-readiness.md)，再核实实际GitHub/HEAD/diff。旧恢复记录完整[归档](tasks/completed/2026-10-13-pre-live-demo-status-snapshot.md)，不再把旧“#104/105/106/107未合并”当当前事实。

本轮只做无DB全量预检、受保护ignored报告和plan-only目标。三次原失败及修复checkpoint `c1392ea4dd140a811ef74b0f17dadea5183b6c5c`保留历史；修复后24/24、root817/817、基线71/71、类型/增量lint/Server build及源码门禁通过，[复审](tasks/active/evidence/ainuoke-live-demo-readiness/operator-wrapper-final-local-review-2026-10-13.md)。用户已在工具HEAD `4b4a09eac5ada875a452a743715f65e3e69719a1`运行成功，558合同全量/稳定、颜色552可用6无效、14,411需求单位12,655已知1,750缺失6冲突；耗时8分25秒、物料24.2MiB/6分55秒。受保护私有报告ACL/hash已核对，[脱敏证据](tasks/active/evidence/ainuoke-live-demo-readiness/real-full-preflight-2026-10-13.md)。不能重复全量采集或将成功升级为首绑/调度/人工验收。GitHub交付NETWORK_DEGRADED、分支未送达/无PR，不重建/重复PR/撞远端；精确SHA/CI待恢复。

执行方式已由用户后续调整：Codex可自行调用同范围已授权只读脚本与既有本机CredentialFile，密码只在短命进程内，不读取到模型/日志；此前用户私密终端执行是原阶段边界。尚无新隔离目标执行授权，先准备实际镜像/端口/资源归属与可审查计划。不能借本次只读权限连接真实业务DB、首绑或激活持续写入。全量数据缺口待最小定向证据分类，单位缺失不等于数量未知；capture完成后再等待间隔，真实频率尚未测量。

约束：原UI/正式数量/去重/单位公式/SQL/default flags不改；真实账号/业务数据库/宁波/18443/18444不操作；本PR不自动合并。用户正在填写Excel，不覆盖、不导入。持续来源尚未激活，不能把代码/合成测试/只读预检升级为真实展示或人工验收。后续新隔离目标执行需要具体可审查的计划与授权。网络失败按AGENTS，LOCAL ENGINEERING/REMOTE DELIVERY分别记录；不换认证、不force/reset/clean。更新时机：可靠Gate、交付、真实回执或授权变化。
