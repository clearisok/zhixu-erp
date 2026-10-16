# 浏览器验收启动与异步收尾竞态修复

核实2026-10-16；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。沿原worktree收口现有草稿[PR114](https://github.com/clearisok/zhixu-erp/pull/114)与[PR113](https://github.com/clearisok/zhixu-erp/pull/113)，不新建工作树/重复PR/重写历史。G5本Phase基线c7256725fd239308a777a47b7004acd25e398752，财务分支本Phase基线f99c2de278bd84a1aaf1939d3de02c185f016938；均只继承本执行者已核实的测试增量。本文是阶段工程记录；GitHub是实时事实源，源码、CI、运行时、授权或验收变化时更新。

## 实际失败与原因

- PR114的c725在Source运行38842825301通过数据库/来源/构建及前面的浏览器集合后，normalization-review-ui尚未进入页面断言即Invalid URL。原代码只等DevToolsActivePort文件存在；Chromium可能先创建空文件，随后再写端口与调试路径，读取时不是完整两行。
- PR113的0e7在Source运行38842098614通过物料9项后，财务面板关闭焦点同步断言失败。Foundation overlay实际用requestAnimationFrame恢复焦点，测试只等DOM消失就断言，存在调度竞态；原延迟响应隔离已通过。财务f99仅增加3秒条件等待，保留原严格焦点断言，完整SHA Server构建build20261016-110056、面板9/9、基线94/94、main守卫及lint通过。
- 早先的Windows登录profile Cookies清理EBUSY和旧迁移账本漏0024是不同问题，各原失败日志/CI仍保留。G5已有等待所拥有Chromium关闭及有界目录重试，不将它们混为业务失败或把旧红改成绿。

## 本Phase最小共同修复

新增server/integration/chromium-endpoint.mjs：只在端口1–65535与完整Chromium browser UUID路径均有效时返回同一次读取的端口/路径对；空、半写入、缺文件保持未就绪，非法路径不会变成WebSocket URL。不打开额外网络或重启浏览器。普通测试启动预算20秒；Team原45秒启动/退出诊断保持，未延长页面/业务断言。

G5的14个、财务分支的15个既有测试入口共用就绪检查，保留各自全部业务、权限、异步取消、数据/数量和几何断言。Source CI显式加入6项就绪回归：有效LF/CRLF、空/半写入/注入/无效地址、真实文件分段写入、晚创建、持久无效超时和非法预算。没有忽略失败、自动重跑CI或靠延长业务等待掩盖异常。

本Phase不改app/components/features生产代码、SQL、Foundation/Drawer、路由、权限、Source读取或正式数量。没有覆盖旧PNG/receipt/证据hash，没有新人工像素验收。isolated-demo测试仅修改启动读取代码，没有运行现有真实演示或访问其数据库。

## 已执行验证与来源范围

- 共同就绪回归6/6；两分支server/integration全量lint通过。最初移除旧读取后遗留一个unused import，已修复，原失败lint日志保留。
- G5：normalization-review、登录、物料、Team四集合35/35，使用原精确Server构建d0146e4beac4b647b171f01cd92d2913f227295c/build20261016-103022；本Phase生产文件与其一致，仅替换测试启动检查。
- 财务：normalization-review与面板两集合20/20，使用精确Server构建f99c2de278bd84a1aaf1939d3de02c185f016938/build20261016-110056；生产文件未变，焦点与启动修复均为测试代码。
- 本机日志：G5 outputs/gate5-chromium-ready-{lint-fixed,ui}-20261016.log；财务 outputs/payment-chromium-ready-{unit,lint-fixed,ui}-20261016.log。最终提交还须精确main守卫、94基线及新head Hosted三CI核实，旧c725/0e7失败不替代或认证新结果。

用户一次固定两合同6086941只读许可已消费，12/9行、完整两遍一致、1登录+4报表；原文仅受保护报告，本Phase没有再次读取凭据或上游。该结果不是业务数据库写入/Source启用/调度授权，也不能将过期报告当作新鲜发布输入。不修改真实账号/业务库、旧四单窗口、宁波18443/18444、现有演示或部署，不自动合并。

## 交付与后续判断

保留原分支、提交和所有私有证据；每个分支将本Phase增量独立commit，安全工具至多一次push并独立核实远端完整SHA。已精确送达时只读核对，不重复push。默认路径与额外公共仓库探测有波动，当前项目认证Git读/receive-pack dry-run已实测；恢复只对进程选用新核实的GitHub官方地址，不改共享配置、认证或TLS。先前保守停止分类原收据不改写，权限/分歧与底层错误的进一步原因未凭空定论。

PR114及PR113仍是含#109→#110→#111→#112等依赖的累计草稿。即使三CI通过，也需先合入获准父依赖、对齐main并重新审查收敛差异；工程复审不是累计所有文件的人工业务验收、真实Source激活或部署批准。
