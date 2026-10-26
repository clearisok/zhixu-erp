# G5 可信订单上下文创建报价：当前隔离工程证据

2026-10-24；本文件证明本地合成工程验收，不证明合并、部署、真实来源激活或用户人工接受。
核实 main 为 `e01a11952b648024c0bd6bf4259de429374981e2`；当前任务分支
`codex/order-context-quote-current`，从已保护的 Gate4B 干净前向继续。
产品/测试冻结源码 `68a38b6bfb0785cc6019381f095660b38cf8fbf7`，tree
`ae776c8e4002ad26d6f7dadd89dfb2dc6d257f70`。其产品输入 a146 与68a之间仅测试/任务文档变化。

## 范围和实际实现

D147 已批准 G5 的窄 V1 接线：未采用商业依据的可信合同订单，在原“维护来源”选择页显式进入
既有报价 new 页；先展示只读合同上下文，用户明确创建经销草稿，再进入原 Editor。
不因打开、刷新、返回或读回执创建报价。普通报价中心的一键默认创建保持原语义。

服务端从保存的稳定 SO、有效归属、合同 link/ID/BillNo 读取款号、精确数量、交期；
不按品牌/客户名称猜主数据。合同类型明确覆盖不相容的默认加工类型；加工、完成/取消、
历史非有效订单和已采用商业依据订单拒绝，不回落普通默认创建。
新增0033仅保存不可变创建参考，同原 Quote writer、编号、actor/request、审计和回执事务提交；
创建参考与商业采用分离，同一报价仍可服务其他订单，不写 SO/CCT/物料/排单。

幂等包含订单上下文，普通旧摘要保持。两阶段均校验新鲜权限、Source/设置和有效归属，
合同行共享锁持有至提交。已知业务拒绝保存 rejected；未知或缺回执不自动重 POST。
刷新恢复只 GET 原请求；当前/旧会话及 layout owner 先核对，旧200/401不得干扰新登录。
0033 FK、完整引用盘点/指纹和未升级可选表处理同步，未恢复订单归一公开写入口。

## 实际执行与范围

新建规范长路径 Git archive，复用已有依赖，不安装。所有 PG/HTTP、账号、合同及来源均为测试自建；
私有 Chromium profile 只用于本轮，退出确认后才清理。不读取 DATABASE_URL/真实凭据或艾诺科。
源码 archive SHA256 `48eff4868a2f0051578665b65fb8932fb0976f99ab9408f7e6dda90295577722`。

| 检查 | 实际结果 | 进程耗时 |
| --- | --- | --- |
| 全量 TypeScript | PASS | 23,501ms |
| Node 编译、实际载入编译 app | PASS / PASS | 9,609ms / 1,496ms |
| 全仓 lint | PASS | 37,797ms |
| 创建契约、普通创建、订单上下文、引用预览及完整证据5文件 | 68/68 | 42,637ms |
| 标准根非发布部分97文件 | 811/811 | 19,326ms |
| 精确旧构建 before 观察 | 2/2 | 16,330ms |
| 新构建 G5 实际浏览器 | 9/9 | 22,139ms |
| 原报价、P6、来源向导3文件实际浏览器 | 107/107 | 190,540ms |
| Browser 兼容构建、产物检查 | PASS / PASS | 9,902ms / 2,773ms |
| Server/session/snapshot 构建、产物检查 | PASS / PASS | 10,147ms / 2,670ms |

上述测试均0失败、取消或跳过，数量包括父节点，不是独立业务场景数。
5文件覆盖原0009非空升级、当前迁移集初始化、可选引用表、FK指纹、并发/撤权、回滚、
真实 COMMIT 后丢响应与原请求恢复；不声称另做真实0032业务库升级。
两模式产物各45页、1 fallback、109 assets；检查器为原已审1028文件，未降低检查。
Browser 保留1条 users 页 modulepreload 提示，Server为0；提示不代表必需页面缺失。

新增浏览器覆盖首次 enabled 单击（真实 GET 回复屏障，释放后不补点）、只读进入/刷新/返回、
大写合法 UUID、双击一单、已知拒绝回执、真实提交延迟回执、A→B→A 下旧200和旧401、
迟到上下文401、当前401、无权/不存在不回落；断言无订单/商业版本写入。
六宽1920、1536(DPR1.25)、1440、1280、900、390的上下文页无页面横溢出；
主按钮桌面38px、手机44px高。该测量不证明全部展开内容或全应用像素。
所有新浏览器/HTTP/PG owned cleanup 终态通过。

独立复审只读核对代码与日志，无剩余 P1/P2，未替其声称运行测试。
预冻结发现的父级 passive 导航锁通知时序问题已改为 layout 通知，保留全部阻塞条件；
首次可用单击实际通过。来源 UUID 按既有服务端规范小写化，未改变普通无上下文行为。
此轮未发生产品测试失败；前序短路径构建、宽批次和截图门禁失败仍保留在各自原阶段。

## 图像与身份

before 渲染精确 `6ef9e37493127661a9d805979660378f6340ad5f` 旧 Server 客户端，
后台及测试为当前68a；显式 before 模式才允许外部旧静态目录，观察不点击创建。
after 禁止该覆盖，使用当前完整68a，buildId `order-context-68a38b6b-server-20261024`，
实际 buildTime `2026-10-24T06:26:21.205Z`。前后 build-info/几何原文另存同目录。
主控实际查看7张图，仅工程检查，不等同用户接受。

- [旧来源1440](evidence/2026-10-24-order-context-quote/before-source-1440.png)
- [旧来源390](evidence/2026-10-24-order-context-quote/before-source-390.png)
- [旧new页1440](evidence/2026-10-24-order-context-quote/before-new-1440.png)
- [旧new页390](evidence/2026-10-24-order-context-quote/before-new-390.png)
- [新上下文1440](evidence/2026-10-24-order-context-quote/after-context-1440.png)
- [新上下文390](evidence/2026-10-24-order-context-quote/after-context-390.png)
- [原Editor创建参考](evidence/2026-10-24-order-context-quote/after-created-editor-1440.png)

新来源入口有首次单击及六宽交互断言；未把旧来源截图冒称新增按钮的 after 像素证明。
107项包含现有来源弹窗布局回归；本轮不增加新的来源 UI 设计。

## 后续门禁和不扩大的边界

ignored `outputs/order-context-quote-current-20261024/` 保存命令、时长、完整日志和回执。
本证明之后只前向新增清单/状态证据，保留原247证据/47能力及运行快照。
剩余两个发布根文件和精确 main 守卫须在证据绑定后实际执行，当前不提前写 PASS。
97文件811与其结果按实际 SHA 联合记录，不重复运行未改变的成功范围。

Actions=0，无新 push/PR/ref mutation、merge/close、部署、真实账号/业务库/卷、凭据或 Source 读取、
绑定/激活/调度、旧入口退役或共享 Git/TLS/proxy/auth 修改。#125 精确 API 例外仍待原答复；
不借只读网络成功撤销旧 STOP。3001/50426/59069/62426和全部既有结果、备份保留。
本地能力 implemented=yes、merged=false、isolatedTest=passed-historical、humanAcceptance=not-run、
sourceActivation=not-applicable、18443/18444 not-deployed；旧运行 source/image 不重观察或重写。
完整 Goal 仍 active，后续资源/排单/完成、4C、出货与关账保留各自依赖及业务前置。
