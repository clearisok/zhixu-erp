# 织序 ZHIXU｜本地工厂业务系统

> 开发者与 Codex：开始修改前请先阅读 [`AGENTS.md`](AGENTS.md) 和 [`docs/PROJECT_INDEX.md`](docs/PROJECT_INDEX.md)。当前仓库同时包含 legacy 根路径 ERP、浏览器 mock 业务路径，以及 Phase 1 Node/PostgreSQL server foundation；边界详见项目知识文档。

面向成衣工厂的本地生产业务系统，覆盖：

- 成衣报价：客户、款号、成本、毛利、有效期、报价状态及 CSV 导出
- 工厂订单：报价转单、订单金额、交付日期和履约状态
- 生产排单：按订单分配产线、日期、数量及生产进度
- 账号权限：管理员、业务员、计划员、只读用户
- 操作审计：记录登录、创建、转单、状态变化和密码修改
- 数据保障：PostgreSQL 持久化、容器健康检查、备份与恢复

## 本地开发与生产验收

两套环境必须分开使用：

- DEV：<http://127.0.0.1:3001>，直接运行当前源码并支持热更新。日常 React/CSS 开发先在这里验证。
- PROD Docker：<http://127.0.0.1:3000>，运行 production build，只有显式重建后才更新。

```powershell
# DEV（端口被占用时明确报错，不会结束未知进程）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev.ps1

# PROD Docker 常规重建
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\rebuild-local.ps1

# 仅在确认 Docker 缓存异常时使用
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\rebuild-local-clean.ps1
```

两个环境都提供 `/build-info.json`，并在页面底部显示克制的 `DEV/PROD · commit` 标识。排查旧页面时，先比较页面和该接口的 `environment`、`buildId`、`gitCommit`、`buildTime`，不要凭页面外观猜测版本。

### Phase 1 Node server foundation

Node API 开发进程默认监听 `127.0.0.1:3100`，Vite 将浏览器同源 `/api/v1/*` 代理到该端口。先从 `.env.example` 创建本机 `.env` 并填写数据库与 bootstrap 管理员密码，然后使用两个 PowerShell 终端：

```powershell
npm run server:dev
npm run dev:local
```

一次性 PostgreSQL 16 集成测试不会连接 `zhixu` 或用户数据库：

```powershell
npm run test:postgres
```

本地容器化 Node static + API 路径使用显式 profile，并继续复用 `database` 服务和命名 volume：

```powershell
docker compose --profile server-foundation up --build server
```

该 Phase 1 路径只包含 Auth/RBAC、OperationLog 和 migration foundation；SalesOrder 等浏览器业务尚未切换到服务器。

## 首次启动

请先启动 Docker Desktop，然后在 PowerShell 执行：

```powershell
Set-Location 'D:\workspace\preparesystem'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Zhixu.ps1
```

系统地址：<http://localhost:3000>

初始管理员用户名和密码必须通过未提交的 `.env` 提供；仓库不再提供硬编码初始密码。首次登录后应立即轮换 bootstrap 密码。

## 日常启动与停止

代码没有变化时，可跳过网页重新构建：

```powershell
Set-Location 'D:\workspace\preparesystem'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Zhixu.ps1 -SkipBuild
```

停止系统：

```powershell
docker compose down
```

`docker compose down` 不会删除业务数据库。不要使用 `docker compose down -v`，后者会删除数据库卷。

## 数据保存位置

业务数据保存在 Docker 命名卷 `preparesystem_zhixu_data` 中。网页容器更新或重启不会清空报价、订单、排单、账号与审计记录。

查看运行状态：

```powershell
docker compose ps
docker compose logs --tail 100
```

## 备份与恢复

建议每天营业结束后执行一次备份：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Backup-Zhixu.ps1
```

备份文件保存在 `D:\workspace\preparesystem\backups`。请定期将该目录复制到另一块硬盘或企业备份盘。

恢复前先停止业务操作，并明确指定备份文件：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Restore-Zhixu.ps1 `
  -BackupFile '.\backups\zhixu-20260814-120000.dump' `
  -ConfirmDataLoss
```

恢复会替换当前业务数据，因此脚本要求显式传入 `-ConfirmDataLoss`。

## 角色权限

| 角色 | 权限 |
| --- | --- |
| 系统管理员 | 全部业务、账号管理、审计记录 |
| 业务员 | 新建报价、更新报价和订单、报价转订单 |
| 计划员 | 更新订单生产状态、新增排单、推进排单进度 |
| 只读用户 | 查看经营、报价、订单和排单数据 |

## 局域网使用

系统默认只允许本机访问。如果需要工厂局域网内多台电脑访问，将 `.env` 中的：

```text
ZHIXU_BIND_ADDRESS=127.0.0.1
```

改为：

```text
ZHIXU_BIND_ADDRESS=0.0.0.0
```

然后重启容器。局域网开放前应完成管理员改密、Windows 防火墙访问范围限制，并使用固定内网地址。不要直接将 3000 端口暴露到公网。

## 配置文件

数据库密码、管理员初始密码、监听地址和端口保存在项目的 `.env` 文件中。该文件已被 Git 忽略，不应通过邮件或公共代码仓库传播。

构建完成后若看到 Node/V8 的 `Assertion failed`，这是 vinext 在 Windows 退出阶段的兼容性提示；`Build-Local.ps1` 会校验新生成的网页文件，校验通过后仍会正常继续。
