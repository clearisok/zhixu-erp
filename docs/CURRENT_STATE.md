# 当前状态

> 2026-10-09；当前任务：Quote Trial UI Usability Repair。历史证据见 [归档](tasks/completed/2026-10-09-pre-trial-state-history.md)与 AI_HANDOFF 历史段。

## 当前试用与工程边界

- 工程基线：PR #81 merge `cc3c450562e692b696024558706954816227cb8a`。保留报价试用范围（D-098），不新增业务模块。
- Windows 独立试用目标 `zhixu-quote-trial-win01` / `https://localhost:18443` 已部署 READY（用户提供的已完成证据）；原应用镜像 `zhixu-quote-trial:9ee254db89c6`。用户确认密码问题已解决、已登录并打开页面；完整三张人工业务卡尚未确认通过。
- 本轮不访问或更换该运行环境，不操作其数据库、Browser profile、COS、密钥、备份或旧 3000/3001/3002。PR #82 Windows 运维交付与本轮 UI 修复分开。

## UI 修复与验证

- Server 列表：紧凑工具区、选择模式上下文；9 列默认包含成本，既有列偏好不覆盖，显式恢复默认。可选 readable 表格提供真实像素下限、表内横向滚动与右侧操作；其他共享表格默认 fit-first。
- 新建：紧凑加工/经销选择和创建/取消。详情：正常技术文案收进诊断入口，真实阻断提示保留；首屏可开始填写，成本不折叠。中等桌面复用展开的紧凑成本布局；退出按钮不再撑高文档；sticky 在资料就绪后绑定实际 workspace。
- 隔离实际 Chromium 61/61、auth/persistence 67/67、共享表格 SSR 2/2、npm test 674/674；typecheck/lint/Server build PASS。Server/default Browser frontend 均构建验证，默认 identity 为 browser/browser/writable/session。
- 同尺寸 before/after：1920×1080、1440×900、1280×800、900×800，100% 缩放；合成截图与 DOM 证据保存在仓库外，不发布用户业务画面。功能回归包含精度/null/0、成本同步失败、CAS、版本/Estimate 权限、导出与附件下载字节。
- 新候选构建与独立 PR 交付见 AI_HANDOFF；代码修复不代表真实 18443 已更新。下一步是审查新候选，再单独授权应用更新与用户业务卡，不重新引入历史迁移门禁。

## 永久边界

- D-096：全部业务数据从空开始，历史导入 **NOT REQUIRED**；不导入不是删除授权。
- D-097：默认 Browser 保持，显式 Server 不回退旧数据。权限、CAS、事务、精度和历史 Revision 不可变规则保留。
- COS real preflight 已 PASS（历史证据），本轮不重测。延期：整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理。
- 用户试用数据不是可自动清理的测试数据。工程验收、候选构建、真实部署、人工业务验收分别记录。
