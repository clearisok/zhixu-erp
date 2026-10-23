# 系统总览

2026-10-19，以 main `996dfedc12da3527343cd3ff2aa5eea35497e10e` 为工程基线。工程存在、默认构建、实际部署与人工业务接受是不同事实。[校准前原文](tasks/completed/2026-10-19-pre-stabilization/SYSTEM_OVERVIEW.md)保留历史。

## 三条运行路径

| 路径 | 权威持久化与 API | 当前范围 |
| --- | --- | --- |
| 根路径 legacy ERP | PostgreSQL `database/001_schema.sql`、`api_dispatch`；旧 `/api/*` | 旧报价、订单、排单、账号；独立模型和计算规则，不接新 Quote API |
| 默认 Browser | 稳定 localStorage / IndexedDB、mock repository、前向数据迁移 | 报价、订单、生产排单、关账等历史前端能力；本地 mock 权限不构成服务端安全边界 |
| 显式 Server | Node/TypeScript `server/app.ts`、可信 session/RBAC、PostgreSQL `database/migrations/`、`/api/v1/*` | 正式报价/资料/附件/导出、合同接纳、加工批次、订单商业版本、逐色价格、议价、只读物料/货款申请来源、交付计划 API |

```text
显式 Server 页面 → 同源 /api/v1 → session + 权限 + 领域命令 → PostgreSQL
                                      ↑
受控艾诺科读取 → 可信合同接纳 / 独立来源快照（不改报价和历史成交价）
```

Server 不回退 Browser 数据。生产排单和完整关账仍主要为 Browser 领域；Server DeliveryPlan 不等于完整生产模块。来源采集、目标启用和调度是独立运维动作，不随应用启动或构建自动获准。

## 主要代码与事实归属

- `server/quotes/` 与 `features/quote-center/`：报价规格、Revision、PriceVersion；确认以现有 CCT 为准，无 CCT 才读已保存确认快照。
- `server/sales-orders/`：合同/加工身份、独立不可变商业版本、颜色映射、报价中心议价。正式订单无负责人；新业务来源仅报价。
- `server/ainuoke-source/` 与 `features/style-progress/`：固定来源采集、完整性、去重、快照、物料数量与事件。6086941 货款申请观察独立于 6087050，不代表银行实付。
- `server/auth/`、`features/permissions/`：可信会话、七角色预设、领域及金额字段权限；角色预设不等于修改真实账号。
- `features/production-scheduling/`、`features/closing-center/`：Browser 排单/关账；`SalesOrder → ScheduleAssignment[]` 与冻结归属不被本轮迁移。
- `components/foundation/`：共享表格、表单、Modal、侧栏等；业务规则归领域服务，不能只靠按钮隐藏。

路由选择由构建 authority 决定。`/quote-center` 可进入 Server 或 Browser；`/order-center/server-detail` 读取正式 Server SO；`/order-center/detail` 的 Browser 事实不能混入前者。`/production-scheduling` 和 `/closing-center` 不能因相邻模块 Server 化就视为正式 Server 闭环。

## 数据库与运行

- Node runtime 正常启动只读校验 migration ledger；显式迁移使用 advisory lock、checksum、逐迁移事务，已发布 SQL 不重写。新系统定义以 `database/migrations/` 为准，legacy 的 `001_schema.sql` 不代替它。
- `Dockerfile.server` 构建 Node + 静态应用；旧 `Dockerfile`/`docker-serve.sh` 是另一条 legacy 路径。默认 authority 与显式 Server 构建必须核实 `/build-info.json`，不能仅看页面中的 PROD 字样判断是正式业务环境。
- 本机隔离验收使用全新数据库、合成账号和数据、独占端口及可核对源码标识。既有演示和真实业务库不因验收被升级。
- `db/schema.ts`、Drizzle/D1 和 Cloudflare/Sites 部署 scaffold 不代表已有业务数据库；Python Bridge 是受控来源工具，不是 Python ERP 后端。
- 技术版本以 package/lockfile 为准；不为本次修复升级依赖或更改共享环境。

## 验证与未闭环边界

源码/领域测试、一次性 PostgreSQL 集成测试、真实 Chromium 验收和发布基线分别证明不同层。测试用合成数据，不等同于真实来源全量语义验收或用户接受。正式迁移、备份恢复、真实来源激活及生产部署需要自己的范围和证据。

当前入口见 [项目索引](PROJECT_INDEX.md)、[当前状态](CURRENT_STATE.md)、[业务规则](BUSINESS_RULES.md)。权限、数据生命周期、来源及发布证据分别见对应 feature 文档；不要将历史阶段的“未实现”复制成当前能力判断。
