# AI handoff
核实2026-10-12；main 21fbe3b1a7a5968253f923bc904ea067315f00cd，PR100已按用户明确授权于2026-10-12T14:57:34Z合并。用户接受本机合成体验，不等于真实来源/上线验收。

当前 feat/ainuoke-live-readiness 独立worktree，起始HEAD=上述main、baseline clean。本轮新增无DB只读readiness CLI、固定三首页Python probe、合成回归/CI及来源接入步骤；真实HTTP可达但HTTPS/可信后段待核实。不要使用旧Windows凭据或把SSH到宁波后的公网HTTP称作安全通道。

保持UI/SQL/默认路由开关；不修改真实账号、数据库，不部署宁波/18443/18444，不自动合并新PR。私密配置待安全通道核实后才由用户在Linux本地输入，不发聊天。任务与下一步见tasks/active/ainuoke-live-readiness.md；工程证据见同目录evidence/ainuoke-live-readiness/engineering.md。

当前为工程checkpoint；最终manifest须绑定已提交的新证据，保留main全部历史IDs及冻结字节，D108以新版本supersede旧决策证据。LOCAL ENGINEERING与REMOTE DELIVERY分开记录，最终GitHub SHA/CI以唯一PR为准。
更新时机：checkpoint、验证、PR/main、验收与环境变化。历史任务不覆盖。
