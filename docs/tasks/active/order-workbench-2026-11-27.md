# 正式订单工作台 Demo / Issue177

2026-11-27；用户批准 [v1 页面及实施范围](order-workbench-approval-2026-11-27.md)。仅独立分支开发、本地 Demo 和 PR；禁止合并、部署和真实业务写入。

## Delivery Phase 1 baseline

- Worktree `C:/Users/Administrator/.codex/worktrees/f120/zhixu-ainuoke-api`。
- 起点 detached HEAD，`10b9a7d827e1c09f152ead58c21f26712d49a619`，dirty 为空。
- 2026-11-27 本轮通过已核实监听的 7888 进程级 Git 代理 fetch，origin/main 精确为上述完整 SHA。未修改共享代理/认证/TLS。
- 独立分支 `feat/order-workbench`，初始 HEAD 同 main；未改动其他工作树/分支。
- Issue177 记录用户批准；项目字段实际读取后进入 In Progress，不改用户已有字段/视图/自动化。

## 实际实现边界

保留正式详情加载/会话/请求归属及来源和交期维护；只复用现有 Server 客户端展示交付、物料、生产、出货和关账。前置交付计划会提前读取其现有 GET，不改保存或合同所有权。新的待处理区只解释现有 alert，不创建业务风险公式。价格、采集和技术信息可展开查阅。

其他未合并 PR 保持。PR171/172/176 也包含原详情和物料摘要，存在后续合并时的共享文件冲突风险；本分支从实际 main 起步，不复制或覆盖其分支。当前真实 Staging 与 main 并不相同，不能把旧 CURRENT_STATE 的部署 SHA 当当前线上事实；此次没有部署动作。

## 验证和 Demo

待实现和实际检查后填写；未运行项目测试或真实业务验收前不记 PASS。本机未发现运行中的 ERP 服务或 Docker 容器；不会为 Demo 启动既有自动采集器、恢复业务库或重启现有服务器。
