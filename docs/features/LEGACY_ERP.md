# 根路径 ERP

## Purpose

根路径 ERP 是当前本地 Docker + PostgreSQL 可运行的工厂业务系统，覆盖登录、工作台、成衣报价、报价转订单、生产排单、用户和审计。本文用“根路径 ERP”或“旧报价模型”与新版 Quote Center 区分；“旧”不表示它不可用。

## Current behavior

`app/page.tsx` 是单页模块容器，登录后可切换：

- 工作台
- 报价
- 订单
- 排单
- 用户管理
- 审计日志

前端通过同源 `/api/*` 请求 PostgreSQL 中的 `api_dispatch`。Docker 静态服务由 `docker-serve.sh` 提供，数据保存在 `zhixu_data` volume。

## Business rules

- 角色：admin、sales、planner、viewer。
- 报价写入：admin/sales。
- 订单状态：admin/sales/planner。
- 排单：admin/planner。
- 用户管理：admin。
- 报价状态：draft、sent、accepted、rejected、expired、converted。
- 订单状态：confirmed、material_preparing、scheduled、in_production、quality_check、completed、cancelled。
- 排单状态：planned、ready、running、paused、completed。
- 数量必须大于 0；日期和进度受数据库约束。
- 根路径报价公式为 `成本 / (1 - 毛利率 / 100)`。
- 报价转单创建订单并将报价标为 converted。
- 排单总量不得超过订单数量；运行和全部完成会联动订单状态。
- 写操作记录审计日志。

## Data model

权威 schema 在 `database/001_schema.sql`：

- `app_users`
- `app_sessions`
- `login_attempts`
- `customers`
- `quotes`
- `orders`
- `schedules`
- `audit_logs`

`database/002_admin.sql` 仅在用户名不存在时创建初始管理员。

## API

API 不是 Node/Python controller，而是 PostgreSQL 函数 `api_dispatch(method, path, body, cookie, headers...)` 处理。当前端点包括：

- `GET /api/health`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/bootstrap`
- `POST /api/quotes`
- `POST /api/quotes/:id/status`
- `POST /api/quotes/:id/convert`
- `POST /api/orders/:id/status`
- `POST /api/schedules`
- `POST /api/schedules/:id/status`
- `POST /api/users`
- `POST /api/change-password`

除 GET 外，客户端发送 `X-Zhixu-Request: 1`。认证使用 HttpOnly、SameSite Strict cookie 和数据库会话。

## Frontend behavior

- 页面入口：`app/page.tsx`。
- 前端状态和 API 请求集中在该文件，尚未拆成与 Quote Center 相同的 feature 结构。
- 根路径 ERP 的报价字段较扁平：客户、款号、数量、成本、毛利率和状态；没有 Revision/PriceVersion。
- 订单和排单与报价转换/状态联动直接对应 PostgreSQL 模型。

## Operations and configuration

- `Dockerfile`：builder 在镜像内从当前源码执行 production build；最终 `postgres:16-alpine` 镜像复制 builder 产物和 SQL/服务脚本，不复制宿主 `dist`。
- `docker-compose.yml`：应用/数据库容器、Build Info 构建参数与 `zhixu_data` volume 配置；没有覆盖 `/app/site` 的 bind mount。
- `Build-Local.ps1`：生成并校验静态构建。
- `scripts/dev.ps1`：`127.0.0.1:3001` 源码/HMR 开发入口。
- `scripts/rebuild-local.ps1` / `scripts/rebuild-local-clean.ps1`：`127.0.0.1:3000` 常规/无缓存 production rebuild。
- `Start-Zhixu.ps1`：委托生产重建脚本或复用已有镜像，再执行健康检查。
- `/build-info.json`：运行实例版本事实源；页面底部和浏览器控制台显示同一信息。
- `Backup-Zhixu.ps1`：使用 `pg_dump`。
- `Restore-Zhixu.ps1`：只接受备份目录内 `.dump`，并要求显式 `-ConfirmDataLoss`。
- `.env.example`：端口、绑定地址和数据库/初始管理员变量示例。

## Important constraints

- 不得删除 Docker volume 或恢复覆盖生产数据，除非用户明确授权且已确认备份。
- 不得把 Quote Center 模型或公式直接套入旧表；需要正式 schema/API migration 设计。
- `001_schema.sql` 是当前 schema 事实源，但不是完整版本化 migration 系统。
- 任何 API 修改都需要检查数据库权限、审计日志和状态联动。
- `GET /api/health` 可匿名；其他敏感数据按 session 和角色控制。

## Tests

当前没有直接运行 PostgreSQL 函数的自动化集成测试。根级测试只覆盖部分配置或源码契约。数据库/API 修改后至少应在隔离数据库验证登录、bootstrap、写入权限、报价转单、排单上限和状态联动。

## Known gaps

- 无 Alembic 或等价的显式 migration 版本/回滚链。
- API/SQL 无自动化集成测试。
- `app/page.tsx` 体量较大，业务、状态和展示耦合。
- 与 Quote Center 模型、基础资料和真实用户偏好尚未整合。
- Cloudflare worker 不提供这套 PostgreSQL API，因此静态部署不能单独运行完整根路径 ERP。
