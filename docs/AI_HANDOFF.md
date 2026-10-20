# 恢复点：Gate6B排单UI最终本地验收通过，精确交付与新CI

2026-10-21；Goal active/no budget；main996dfedc12da3527343cd3ff2aa5eea35497e10e（独立API核实）。
codex/server-production-planning；root唯一writer、既有reviewer只读。
应用/测试/CI源码919643d8cde2b0ec22987631e685e6a661829881，之后只应改证据/清单/摘要，不复写冻结文档。
[Gate6任务](tasks/active/server-convergence-gate6-2026-10-20.md)、[本批证据](tasks/completed/2026-10-21-production-planning-ui-engineering.md)。

919643精确Server build（三build-info的919/session/server/writable/snapshot）、Node串行导入、types/lint、
17 built排单验收32133.1662ms通过。6baca同阶段49 built、126定向、927项目/116基线/261DB全部通过；
随后只改Server限定CSS、验收兼容和文档；Git diff已核实后台/客户端/authority/AppShell函数字节未变。
旧49几何PASS后像素复核发现390搜索挤压，919分行+非重叠实际断言，最终截图已root查看。所有中途失败/来源/耗时见冻结证据。

新页authority先选owner，不挂Browser；原route+snapshot开关+order/schedule权限；精确字符串表单、当前颜色待核对、
单订单内部/外发、整组重排/固定日期保护、分版本历史。无实际完成/物流/价格/迁移/新权限。
完整session lease、原actor/tab命令、GETunknown后明确人工重试相同requestId/intent/hash，pending/mismatch不重发；
protected router、等待字段禁用、SAVEPOINT预期404/409/422拒绝持久化并清成功orderIds，裸错误不清缓存。
跨SO499→500实际PG边界和POST/receipt200/401的A→B→A均已验收；新旧用户资料未触碰。

新UI契约919/工程证明1c6/D150前向修订1c6均已真实Git blob绑定，原234/49逐项不改，现237/50；
首轮guard检出D150工作树漂移，保留原记录并追加supersedes后main996 guard PASS，未绕过检查。
绑定后927/927项目212626.5359ms、116/116基线210878.984ms通过，均0 fail/skip/cancel；独立只读证据复审无阻断。
下一步干净final文档commit及其main996 guard，既有工具一次安全push/独立API exact SHA，
只调度Source/Team/Baseline各一次并复审，不建重复累计业务PR。此处尚未交付新批，不借旧CI。
6524已有Source39446392644/Team39446399962/Baseline39446406949全success（各一次）。

持续工程Git授权不逐次询问；不改共享Git/TLS/proxy/auth、不合并/关闭#120–127。
不动3001/50426/59069/62426（仍8175）、旧卷/Browser/其他工作树或真实账号/业务库；
无新艾诺科范围、部署或退役。6C/出货/Server关账待继续，未来CNY销售/USD工价不自动换汇。
旧Quote45/44/2和31未启动独立；输入[6524三摘要Git blob归档](tasks/completed/2026-10-20-gate6-inputs/planning-ui-6524c7d0/)。
