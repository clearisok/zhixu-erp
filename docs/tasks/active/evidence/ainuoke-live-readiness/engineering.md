# D108 接入准备工程证据

核实日期2026-10-12（Asia/Shanghai）。GitHub main / branch baseline `21fbe3b1a7a5968253f923bc904ea067315f00cd`；独立分支 `feat/ainuoke-live-readiness`，初始clean。本文件是冻结证据；后续结果新增证据版本，不覆盖旧验收。

## 已确认状态

- 用户原话：“好的 通过 下一轮目标是连上艾诺科 开始实施”；之后单独回答“授权合并 PR #100，再开始下一轮（推荐）”。仅认定统一本机合成体验通过，真实来源、全合同、真实金额与上线未验收。
- PR100 head `cc80819890844d0700999f2136c8ad6c9528816b` 的 source / team-access / baseline 三CI成功；已授权合并于 `2026-10-12T14:57:34Z`，merge为上述main。运行记录：38248018447、38248027241、38248018183。team-access第二次运行通过，历史第一次为Chromium启动超时。
- Source与orderRead仍默认disabled，真实Source未连接；18443/18444/宁波未部署此能力。旧runtime观察不更新日期/image，PR100合并不代表真实运行版本变更。
- 当前用户确认仍用HTTP源，无密码/凭据提供。无凭据HTTP200、同端口TLS握手失败及宁波TCP可达只证明网络事实，不证明加密、登录或报表。来源安全通道待补。详见同目录transport-observation.json；敏感原始trace不入Git。

## 本轮工程与验证

代码：readiness.ts、collector.ts的probe类型、Python server_source.py的固定三首页probe。无DB/serverConfig/writer导入，无新SQL/API/权限/页面/路由开关。复用现有配置加载、固定catalog和受保护transport。

| 本机检查 | 结果 | 边界 |
| --- | --- | --- |
| npm run typecheck | PASS | 当前工作树 |
| npm run server:build | PASS | 含新CLI |
| npm run lint | PASS | 全仓库既有配置 |
| npm run build | PASS | 默认关闭Source/orderRead，不启动服务 |
| npm run test:ainuoke-readiness | 8 PASS / 1 Linux限定SKIP | 真实Python进程+仅合成loopback来源；LinuxCLI由Ubuntu CI补验 |
| Python unittest discover | 60 PASS | 包含6个新增probe用例，既有固定catalog/transport/凭据边界 |
| npm run test:ainuoke-server-source | 20 PASS / 1 Linux限定SKIP | 一次性PostgreSQL+合成来源 |
| npm run test:ainuoke-continuous | 29 PASS / 1 Linux限定SKIP | 一次性PostgreSQL，原绑定/调度/路由边界 |

根级回归/基线守卫须在本冻结checkpoint后绑定manifest，再独立运行；不在这里提前声明PASS。此次无需重新截图，UI无diff；旧截图保持原字节、原render SHA。CI新增readiness命令，Linux私密文件分支必须实际执行。

## 合并前复审（本机）

已逐项检查：源HTTP不得绕过、重定向不转发密码、目标错配先于网络、loopback需明确通道核实标记、参数重复/未知拒绝、首页数量不完整失败、空Discovery不伪造后二报表通过、来源会话过期不重登、stdout/stderr不泄露原始行/秘密、无DB依赖/领域写入。对应两个TS新测试文件及Python新增用例。

未发现此工程范围内的阻断缺陷。合并建议以最终基线守卫、完整本轮CI和精确head核实为前提；没有授权自动合并。真实接入仍阻断：可核实安全通道尚缺，真实私密配置和probe未执行。--verified-tunnel是操作断言，无法由CLI证明后段保护；不得用它批准未知代理。

已知项目限制不变：全合同覆盖未经证明、新增合同自动绑定/主色镜像增量未实现、真实持续运行未验收。历史Quote扩展UI故障未因本轮通过而消失。此PR仅可合并为接入准备，不可据此部署或写真实DB。

更新时机：后续CI/审查/Source通道/真实读取或运行环境变化，以新文件或新冻结版本记录。事实/用户决定如上；建议24小时连续采集及四流各3张真实单据核对仍是AI建议。
