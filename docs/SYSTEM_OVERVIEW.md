# 系统总览

## 当前架构

本仓库是一个 Vinext/React/TypeScript 单仓应用，不是传统的 `frontend/` + `backend/` 分仓。当前存在两条相互隔离的数据路径。

### 根路径 ERP（本地 PostgreSQL 路径）

```text
浏览器 /app/page.tsx
  -> 同源 /api/*
  -> 根目录 docker-serve.sh（静态文件 + API 转发）
  -> PostgreSQL api_dispatch(...)
  -> customers / quotes / orders / schedules / users / audit_logs
```

- Docker 镜像不运行 Node 服务；它以 PostgreSQL 镜像为基础，启动数据库和 BusyBox/`nc` 静态服务脚本。
- `database/001_schema.sql` 创建表、约束、索引和 `api_dispatch` 函数。
- `database/002_admin.sql` 在用户名不存在时创建初始管理员。
- 数据保存在 Compose 命名 volume `zhixu_data` 中。

### Quote Center、订单、排单与关账（当前浏览器 mock 路径）

```text
浏览器 /quote-center、/order-center、/production-scheduling、/closing-center、/basic-settings 和 /system-settings
  -> React feature 组件与领域函数
  -> mock repository / browser storage
     - 报价、订单、排单、关账、附件 ID、基础资料、生产基础设施设置、权限与日志：稳定 schemaVersion localStorage namespace
     - 附件 metadata 与二进制 Blob：IndexedDB
     - 用户 Excel 模板 metadata 与 Blob：IndexedDB
```

新 Quote Center/订单/排单/关账路径不调用根路径 ERP 的 `/api/quotes`、旧订单 API 或旧 schedules，也没有独立真实后端或数据库表。Revision、PriceVersion、单款 SalesOrder、ScheduleAssignment、ClosingPeriod、ClosingAllocation、基础资料和附件只存在于当前前端实现及浏览器本地存储中。浏览器数据使用 `zhixu.erp.local.*` 稳定命名空间、`schemaVersion = 9` 和向前迁移；v5 OrderItem 与 v8 ProductionPlan 只作为迁移输入，旧 sessionStorage/localStorage key 只作为兼容迁移来源。

### Vinext / Cloudflare 路径

`next.config.ts` 使用静态导出；`vite.config.ts` 使用 Vinext、Sites 和 Cloudflare 插件。`worker/index.ts` 只提供 Vinext 应用/图片处理入口。目前 `.openai/hosting.json` 未配置 D1 或 R2，`db/schema.ts` 为空，Drizzle journal 没有业务 migration。

因此，Cloudflare/Sites 构建能力不等于已部署 Quote Center 业务后端。

## 技术栈

- Node.js `>=22.13`
- React 19、TypeScript 5.9
- Next 16 兼容路由 + Vinext/Vite 构建
- PostgreSQL 16（根路径 ERP）
- Docker Compose（本地生产运行）
- Node test runner / TypeScript 源码契约测试
- Drizzle/D1 仅为未启用 scaffold

版本以 `package.json`、lockfile 和配置文件为准。

## 前端路由和模块

| 路由 | 模块 | 数据来源 |
| --- | --- | --- |
| `/` | 登录、工作台、旧报价、订单、排单、用户、审计 | PostgreSQL API |
| `/quote-center` | 报价中心列表 | Quote mock repository |
| `/quote-center/new` | 新建报价 | 内存草稿，保存后进入 mock repository |
| `/quote-center/detail?id=...` | 报价详情/Revision/PriceVersion 编辑 | Quote mock repository |
| `/order-center` | 新订单中心列表与筛选 | Order browser repository |
| `/order-center/new` | 手工订单或翻单草稿 | Order domain service；保存后进入 repository |
| `/order-center/detail?id=...` | 订单详情、交期/数量/价格历史、附件与日志 | Order browser repository + IndexedDB attachments |
| `/production-scheduling` | 直接排单、内部生产队列、外发固定排期、物流建议与交期风险 | ProductionScheduling browser repository |
| `/closing-center` | 月度关账、归属快照、产值平衡与锁账 | Closing browser repository |
| `/basic-settings/brands` | 品牌设置 | localStorage |
| `/basic-settings/customer-salespeople` | 客户业务员设置 | localStorage |
| `/basic-settings/fabrics` | 面料库 | localStorage |
| `/basic-settings/trims` | 辅料库 | localStorage |
| `/basic-settings/production-groups` | 生产组基础资料 | localStorage |
| `/basic-settings/outsource-factories` | 外发厂基础资料 | localStorage |
| `/system-settings/closing-settings` | 关账默认税率与月度生产目标 | localStorage |
| `/system-settings/data-management` | 浏览器数据备份、恢复和显式重置 | localStorage + IndexedDB repositories |

共用 UI Foundation 位于 `components/foundation/`。Quote Center 领域代码位于 `features/quote-center/`，订单领域位于 `features/order-center/`，排单位于 `features/production-scheduling/`，关账位于 `features/closing-center/`，报价基础资料位于 `features/basic-settings/`，共用生产设置位于 `features/operations-settings/`。正式关系为 `SalesOrder → ScheduleAssignment[]`，以及 `SalesOrder → ClosingAllocation`（可选引用稳定 ScheduleAssignment）。这些浏览器领域不修改根路径 PostgreSQL schema。

## 数据库与 migration 状态

- 权威生产数据库定义：`database/001_schema.sql`。
- 初始化管理员：`database/002_admin.sql`。
- 当前没有 Alembic、SQLAlchemy、FastAPI 或 Python migration/backend。
- SQL 文件会在容器启动时重复执行，主要依靠 `IF NOT EXISTS` 和 `CREATE OR REPLACE`；它们是初始化/演进脚本，不具备完整 migration 版本、升级序列或回滚历史。
- `db/`、`drizzle/` 指向 SQLite/D1 scaffold，当前不承载业务表，不能作为 PostgreSQL schema 的替代事实源。

## 根路径 API 概览

`api_dispatch` 当前处理：

- 健康与会话：`GET /api/health`、`POST /api/login`、`POST /api/logout`
- 初始化数据：`GET /api/bootstrap`
- 报价：创建、变更状态、转订单
- 订单：变更状态
- 排单：创建、变更状态
- 管理：创建用户、修改密码

除 GET 请求外，前端发送 `X-Zhixu-Request: 1`。权限和具体约束见 `docs/features/LEGACY_ERP.md` 与 SQL 实现。

## 构建、运行和数据保护

- `scripts/dev.ps1`：固定在 `127.0.0.1:3001` 直接运行当前源码；支持 HMR，端口冲突时只报错，不自动结束进程。
- `npm run build`：静态生产构建；Vite 插件自动生成 `dist/client/build-info.json` 并把同一份 Build Info 注入页面。
- `scripts/rebuild-local.ps1`：生产 Docker 的常规显式重建；`scripts/rebuild-local-clean.ps1` 仅用于确认缓存异常后的无缓存排查。
- `Dockerfile`：多阶段构建；builder 在镜像内复制当前 build context 并执行 `npm run build`，最终 PostgreSQL 镜像只复制 builder 的 `/build/dist/client`，不接受宿主旧 `dist`。
- `Start-Zhixu.ps1`：正常模式委托给生产重建脚本，再轮询健康检查并可打开浏览器；`-SkipBuild` 只复用已有镜像。
- 运行实例通过 `/build-info.json` 和页面底部标识暴露 environment/buildId/gitCommit/buildTime。HTML 与 Build Info 禁止长期缓存，带 hash 的 `/assets/*` 使用长期 immutable 缓存。
- `Backup-Zhixu.ps1` / `Restore-Zhixu.ps1`：PostgreSQL 备份与恢复；恢复要求显式确认数据丢失。
- `Build-Local.ps1` 对 Windows 下特定 Vinext 退出异常有容错，但只有生成新鲜且含 ZHIXU 标识的 `dist/client/index.html` 才视为成功。
- Quote Center 浏览器数据的 Build/HMR/rebuild 安全规则见 `docs/features/DATA_LIFECYCLE.md`；这些构建脚本不读取、清理或重置浏览器 localStorage/IndexedDB。

## 测试边界

自动化测试主要覆盖 Quote Center、订单、排单、关账、计算、Revision、全局费用、基础资料、Foundation 表单行为和源码契约。订单到关账测试覆盖持久化、Quote 转单、翻单、交期、数量/价格历史、生产投影、关账快照/产值/锁定、权限、日志、搜索与备份恢复。当前没有覆盖 PostgreSQL `api_dispatch` 的集成测试，也没有容器级端到端测试。任何数据库/API 修改都不能仅凭前端测试判断安全。
