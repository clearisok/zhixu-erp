# 织序 ZHIXU｜工厂成衣管理系统

包括成衣报价、工厂订单跟踪和生产排单的本地管理系统。

## 使用 Docker 在 PowerShell 启动

请先安装并启动 Docker Desktop，然后在 PowerShell 执行：

```powershell
Set-Location 'D:\workspace\preparesystem'
npm.cmd run build
docker compose up --build -d
Start-Process 'http://localhost:3000'
```

应用先在 Windows 宿主机生成独立运行文件，再由 Docker 打包，因此容器内不需要下载 npm 依赖。项目通过 DaoCloud 镜像加速站下载 Node 基础镜像，以避免当前网络无法连接 Docker Hub。

## 常用命令

```powershell
# 查看状态
docker compose ps

# 查看日志；按 Ctrl+C 退出日志查看
docker compose logs -f zhixu

# 停止系统
docker compose down

# 再次启动
docker compose up -d

# 更新代码后重新构建
npm.cmd run build
docker compose up --build -d
```

## 更换端口

如果 3000 端口已被占用，可改用 8080：

```powershell
$env:ZHIXU_PORT = '8080'
docker compose up -d
Start-Process 'http://localhost:8080'
```

## 镜像仍然无法下载

若 DaoCloud 镜像也连接超时：

1. 打开 Docker Desktop 的 **Settings → Resources → Proxies**。
2. 选择 **System proxy**；如仍失败，选择 **Manual configuration** 并填写当前可用的 HTTP/HTTPS 代理地址。
3. 点击 **Apply & restart**。
4. 回到 PowerShell 再次执行 `docker compose up --build -d`。

如果机器完全离线，可在另一台可联网且安装了 Docker 的电脑上执行：

```powershell
docker pull docker.m.daocloud.io/library/node:22-alpine
docker save -o node22-alpine.tar docker.m.daocloud.io/library/node:22-alpine
```

将 `node22-alpine.tar` 复制到本机，然后执行：

```powershell
docker load -i .\node22-alpine.tar
docker compose up --build -d
```

系统当前使用演示数据，新建和保存操作只用于界面演示，容器重启后不会保留新增记录。
