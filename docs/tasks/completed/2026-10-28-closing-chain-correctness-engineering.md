# 关账核心链终审修复工程证明

2026-10-28，feat/order-closing-month-plan。clean阶段输入f37b612e09dc44721fe8204c82e45976020b283e；冻结保护提交1c64664a8aa16000908850156d431e8194dbe31a；最终业务源码fde8b0f1f467edfc864cbd616756ad1778c9f40e。沿用已核实本地main869ee84dd0b31de6161011e4aa560678b244a64d，本轮未刷新远端，不称最新main。

## 已验证事实

- 已批准Gate0中的既有只读审查者沿D169–D174核心链发现2项P2、0P1。调月全局归并可能改变未选择冻结行；年度全候选重复资源载荷在完整加载前缺累计边界。原失败、修复和保守拒绝限制见[阶段记录](../active/closing-chain-correctness-review-2026-10-28.md)。
- 冻结模型/真实PG首次10项中8通过2失败，7577ms；修复后10/10，8399ms；强化SQL直接换ID/合并/插入冻结行及重开后允许操作、manifest前后比较后PG1/1，7880ms。0050非空升级0051保留11张关账表全部原行，仅迁移登记增加1条。新迁移不修改旧SQL、不回填/修复既有历史。
- 年度预算真实PG红测1失败，6683ms；修复后1/1，7685ms。全候选同RR、fresh权限后、首个完整facts读取前，逐assignment按live最多3次/纯冻结2次预留8MiB；相同hash不去重。单live三份可读、跨SO超限先拒绝、frozen四份按2次可读、撤权先拒绝及固定HTTP错误均有负控。
- Git archive规范源码3220 blobs逐一验证，0 tracked overlays；复用已有依赖junction，没有安装。完整typecheck、lint、默认前端build、server:build退出0。默认build的Browser配置不冒称Server输入。
- 同一规范fde8源码以显式server/session/snapshot与完整source SHA重新构建成功，buildId closing-chain-fde8b0f1-20261028；当前build-info与Server验收一致。
- 完整受影响关账TS模型/客户端/API/SQL回归243/243，221997.7109ms，0失败/取消/跳过。命令使用17个closing集成文件及closing模型/客户端测试文件，未声称运行全仓npm test。
- 上述精确Server静态产物＋owned合成PG/HTTP＋独立实际Chromium9/9，14708.4022ms，0失败/取消/跳过；含全年两项、内外发同范围、整单包含隐藏片段、焦点保持、部分调月原回执恢复且一次POST、锁定/空税率、权限撤回、390px实际布局。不是仅mock或截图检查。
- 审查者分别复核f37→1c64664及1c64664→fde8组合，静态范围无剩余P1/P2；审查者没有运行测试。主控承担上述实际验证，不能称全ERP最终独立复审完成。

私密原件在outputs/closing-chain-static-review-20261028；规范runner在D:/zhixu-server-convergence/candidates/closing-chain-fde8b0f1-f74e448601/source。失败日志、默认构建与正确Server构建分别保留，不删除原证据或用新结果冒充旧source。

## 实机与边界

新合成演示http://localhost:62411/closing-center?year=2027，源码fde8，独立owned临时PostgreSQL zhixu-pg-it-49b6fa3d9241；不是持久正式目标或生产部署。使用独立localhost，不覆盖61104的127.0.0.1会话、未保存预览或订单输入；旧服务、Browser、卷、备份、工作树保持。预备127.0.0.1:53001同源实例未作为当前用户入口，保留不清理。

实际Cua已登录新合成入口并显示精确fde8构建。筛选仅外发后，将SO-00000001蓝色外发10件从2027-02调到2027-11；先核对预览，再单次保存，页面确认原请求已核实。保存后表格两个月各10件，各显示成衣CNY1000/加工USD25，全年外发CNY2000/USD50不变。私密live-demo-after-save.jpg保留实际结果。原月份输入自动fill未生效时没有提交，核对DOM真实空值后使用原生年月分段录入2027-11再预览；不把这次工具输入问题描述为业务提交成功。未更动旧61104。

本阶段Hosted0、远端写0、真实Source0，无旧账号/业务库操作、自动merge、正式部署、切换或资产退役。PR130仍是此前精确远端head61704afe22fe9fd0ea9f6625c6092fcbb9575dfc；本片未送达，Git/ref STOP_AUTH_OR_DIVERGENCE原退出1根因未解。未重复付费CI或未经授权移动引用。

## 后续验收及不确定性

本证明checkpoint后再前向冻结D176/两份契约/本阶段/本证明，执行同main精确发布守卫；本文件本身不预写守卫PASS。未重复运行未改发布工具的既有168项，其原证据仍在独立工具工程证明，不称本片新结果。

8MiB是保守最坏预留，生产筛选可能少读，因此可能比实际传输更早拒绝；超限不截断汇总。0051只保护新版本，不修复历史。稳定执行归属漂移仍409、恢复写命令尚未实现；三处具体配套UI仍待此前问题答复。核心UI已批准，无需再次确认。完整Goal还包括配套接线、归属恢复、全业务终审、精确远端/必要CI、显式合并及目标切换；本片完成不能代表整体目标完成或用户业务接受。
