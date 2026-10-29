# Server 写入边界与旧挂载恢复依赖

2026-10-29；核对产品源 **5c8cb8037376288aa71043e799a057e21f1b985d**，开始文档 head **c4cbac73879137de153fde9f78972a6df0ec012a**。本片沿原 Gate0–8/R，未修改产品、SQL、权限、UI 或旧环境；没有新真实 Source、CI、部署、合并或清理。证据为实际源码/调用路径、五次只读 HTTPS GET 和 Docker 归属/文件存在性观察，不冒称新 Chromium 或完整权限矩阵测试。

## 正式 Server 入口的 owner

以下文件与产品 main 的对应文件未改；具体 Git blob 与观察回执 hash 见[安全摘要](2026-10-29-server-write-boundaries-and-retirement/validation-summary.json)。这是已列入口的边界核对，不是证明仓库完全没有 Browser 代码。

| 范围 | 实际选择与证据 | 结论 / 限制 |
| --- | --- | --- |
| 初始化、权限、未开放路由 | `local-data-bootstrap.tsx` 在 server authority 下直接拒绝 Browser 初始化；`quote-server-boundary.tsx` 使用 TrustedPermissionProvider，未开放路由不渲染 children | 不挂载 Browser PermissionProvider，也不 seed/migrate 本地业务；未完成的模块明确拒绝 |
| 首页 | `app/page.tsx` 的 Home 在 server authority 下只挂 LocalSingleUserLanding，转正式报价中心；LegacyHome 另为保留分支 | 文件里仍有旧组件，不代表当前正式入口会调用旧 `/api/bootstrap` |
| 报价 | `production-quote-pages.tsx:190–192` 在挂载前选择 ServerList/New/Detail；读取失败只显示错误；正式 Quote/CCT/附件通过现有 Server 客户端 | 个人列表布局使用独立 UI key；不据 localStorage 字样认定业务双写 |
| 订单、物料 | 订单列表直接 ServerOrderCenterPage；正式详情用 serverSalesOrderReadRepository；物料详情按 authority/正式 UUID 选择 ServerStyleProgressDetailPage | Server material 用正式摘要及计划 API；不挂 Browser style-progress IndexedDB provider |
| 生产组、外发厂、物流 | production-resource-settings-page 先选择 Server 页，再挂子组件 | 保留的 Browser repository 工厂只是创建惰性对象，load/save 才访问 store；不能据导入即断言发生写入 |
| 排单、完成 | production-scheduling-authority-page 挂载前分流；Server 页调用现有计划/执行客户端 | 旧 repository 保留；本片不重跑已通过的生产实际浏览器与 SQL 组 |
| 关账 | closing-authority-page 挂载前选择 ServerClosingAdjustmentPage；useClosingOwner 绑定会话、上下文与权限过滤客户端 | Browser ClosingCenterPage 不挂载；实际生产、月计划、财务快照仍独立 owner |
| 退役业务命令 | `server/app.ts:691–702` 在后继旧 dispatch 前拦截标准大小写的旧操作，保留鉴权和 mutation boundary | 独立复审发现归一路由后继匹配使用 `/iu`，前置拦截却区分大小写；混合大小写可进入旧分支，P2待独立修复。不能称全部旧写入口已关闭 |

正式客户端另保留按用户/标签页隔离的原请求恢复记录：`delivery-plan-pending.ts`、`production-plan-outbox.ts`、`closing-pending.ts`。这些存待核对请求，不是当前订单/生产/关账的权威集合；损坏时拒绝继续写，不用其数据代替 Server 成功结果。本片未读取或修改任何用户浏览器存储。未来删除旧代码须保留纯模型/计算公式和历史读取，不能顺手清除恢复记录或 UI 设置。

## 当前镜像的旧 HTTP API 负向核对

对真实两合同新隔离目标 `https://localhost:54315` 进行严格 CA/主机名验证、无 Cookie/登录的五次 GET：build-info 为精确 main5c8/server；旧 `/api/bootstrap`、`/api/quotes`、`/api/orders`、`/api/schedules` 均 **404/not_found** 且不签发 Cookie。没有 POST、用户账号、业务或 Source 操作。

私密进程为定位 CA 读取了新目标配置，配置含生成的技术凭据；没有在 HTTP 使用这些凭据，也没有读取艾诺科凭据文件或真实账号。原机器回执 `existingCredentialAccess=false` 标签过宽，原件保留，安全摘要明确收窄为“HTTP未用凭据、读过生成目标配置”，不把它解释成完全没有配置访问。

源码 `server/app.ts` 仅将非 `/api/` 路径交给静态服务，最后未知 API 返回404。本结果证明这些旧 HTTP 名称在该镜像不接入旧系统；不推广为所有端点/权限/浏览器挂载的全面动态证明。前件[119项浏览器结果](2026-10-29-pr131-browser-route-recovery.md)保留其原构建、范围和失败历史，本片未重跑或改写为新 head 通过。

## 旧运行资产的新恢复风险

本次只读枚举88个容器的选定 Mount/State 元数据，过滤原 `7bf3/zhixu-ainuoke-api` 路径。该目录当前无 `.git`，仅 `node_modules`。查到 **9个未运行的旧测试容器、24条缺失文件挂载**；全部属于旧 it/recovery 项目，无运行中的依赖容器。不能由名称推断这些卷内容可删除，也未确定目录缺失原因或完整恢复能力。

当前54315真实来源项目使用 D:/ 冻结 ops/输入，未依赖这些缺失挂载；本片没有更改任何旧容器、卷或原目录。没有为验证可恢复性而启动旧环境。

按九个容器的实际 image OCI revision **8175f6280d54b6d4af28cb2ebe6d86741b906b9d**，从本地 Git 对象提取所需七个 canonical 运维文件，保存至全新目录 **`D:/zhixu-server-convergence/legacy-bind-code-2e8610bde5`**，逐文件记录 Git blob、SHA256/长度并完成语法检查。原缺失挂载状态不变。

该副本仅为将来人工核对的恢复候选：没有原挂载时字节证明，不能称为原文件备份或旧环境恢复成功。没有覆盖7bf3、重建工作树、替换配置、启动旧容器、安装依赖或清理任何资产。原观察和恢复 manifest 双份保留在本工作树 outputs 和新目录。

| 对象 | 本片后的分类 | 下一步 |
| --- | --- | --- |
| 用户要求保留的3001及历史资产 | 必须保留；本片未操作或启动 | 不以未监听为删除依据 |
| 50426旧入口/目标切换 | 仍保护；本片未切换 | 原受控预览/新项目/明确批准后执行 |
| 当前54315两合同目标 | 独立、继续保留 | 真实采集已停止，历史读取按原时效；不借旧配额续采 |
| protocol-5b16a665dd | 已停止，原五容器/四卷及协议证明保留 | 不是新增长期业务入口，不自动删卷 |
| 九个缺失挂载的旧测试容器 | 暂不退役，恢复依赖需核对 | 保留数据/失败现场，先核原来源和必要文件，再提交具体收口批次 |
| 共享依赖 junction、其他工作树/卷/Browser | 本片未清查内容，不改变原保护分类 | main 祖先或 clean 不能证明 ignored 数据无价值 |

本片关闭的是“旧 HTTP API 是否仍接入当前候选”及“7bf3 缺失是否影响哪些挂载”的特定未知。未关闭 #132 merge、真实成衣证明、最终 main 镜像、公网/附件/人工接受、50426切换和逐资产退役 Gate；不把保护旧资产当成整个 Goal 已完成，也不让这批未运行测试资产阻塞新隔离 staging 的工程准备。

独立只读复审新增1项P2、无P1：前置归一退役正则区分大小写，后继case/workspace dispatch使用`/iu`；例如混合大小写的归一事件URL可进入旧分支。此为静态可达性，尚未证明实际写入成功，旧权限/业务条件仍在。将从精确main独立修复并补合成测试，不改#132已有head，不对真实库发写请求。其余本片限定范围未发现P1/P2；这不等于完整Goal或运行退役通过。
