# 2026-11-19 UI Staging 交付接力

main基线4a8c9bc24b00983d0d79150349adeed5a333a237，分支feat/compact-business-pages，Draft PR156 / Issue155。用户v2只保留订单列表，退休款式/风险列表，保留共享物料详情和数据库历史；用户批准候选Staging，禁止合并/Production。当前交付到人工验收边界，勿继续部署或扩展来源修复。

实际部署不可变源码90de5b0af2dede0afc820aa1fd38dfe8315e9e7a，后续仅文档提交。候选三CI全部SUCCESS（1026/182/紧凑Chromium9，typecheck/lint/前后端build）；b7349f1994b5a1cb4a55802c64e71184ffa5e479三CI也已SUCCESS。原失败和全部授权/测试映射保存在[任务](tasks/active/compact-business-pages-2026-11-19.md)、[工程归档](tasks/completed/2026-11-19-compact-ui-engineering-handoff.md)。

Staging ROOT=/home/jackson/weaveops-staging-preview，TASK=ROOT/releases/compact-ui-20261119，SOURCE=TASK/source clean Git90，RUNTIME=ROOT/runtime/catalog-sync-90de5b0a。仅正式trial/Compose重建3无状态容器，旧镜像、52配置文件、原4卷、database/objects保留。app镜像sha256:674bef4e052c933cf1bfca79f6f54c9c6df7ce407c008eb8067d74a0abd75aed；operator/Worker镜像sha256:6ba443a3acd82bae5042673e0780f71845d6e08b0a69fee52f9641369a29d5b5；Supervisor a0109d4fd68b8ff3fe5556f8e3e1b61312396cc9d3eadc8e861a0e6587441676；executor9765b3a95131cd685a9b02c21c80123e19a93c900e40b28014959f11cb4e7a27。新Policy/cron匹配90，原4卷和23人工表/3账号/630订单身份核验不变，五服务healthy。

新配对备份20261119T041319Z-efa1f646于04:27:55.877451Z成功，独立56文件hash/143表/11对象/3419126585字节dump；manifest c4587c8cb2d29fdf70bdd4aef3495e891a9002a83a7424eb09ec52e4cb10b939，恢复/清理有效。TASK/final-acceptance.json于04:31:23Z只读核验PASS，账本整数58/57记录，不是字符串0058；私有脚本错误断言已按真实SQL类型修正，无DB改动。原B4 STOPPED_FAULT和20261116T193001Z-c6870e6d失败原字节保留。

独立来源故障必须保留：切版前旧4a 03:02:46.56Z因catalog_identity_or_scope_changed停止，enabled=true但paused_reason非空，0Worker。真实Gate8项通过，仅admin_not_paused=false，正确RECOVERY_BLOCKED；不是新备份失败，也不能描述成人工管理员操作。39740完成/112失败/0待处理/运行/未知。UI任务不清暂停/改心跳/last_run/补跑，不声称自然同步恢复。

最终真实公网浏览器目录staging-90de-settled已完整退出0，receipt.logoutVerified=true：12桌面组合真实业务行+连续750ms空闲，详情物料摘要终态，订单实际第二页SO630→580并回原页，7现存报价价格独立、原维护/更多弹窗、无业务写入/来源刷新。已目视复核。原staging-90de-final骨架截图有superseded限定，staging-90de-ready的二次异步race失败保留；不得再用其冒充最终PASS。正常logout后本机私密cookie副本删除、主机cookie标记REVOKED，未提交秘密。

本机artifact根：C:/Users/Administrator/.codex/visualizations/2026/11/18/01a1ec55-eaa3-75f0-a103-83b015d43fb4/compact-business-pages-20261119。comparison.html同合成前后，final-5396产品与90相同，三态/多价是隔离PG合成；Staging实际只有未确认/全部确认，不编造部分确认。1366报价有表内横滚，页面无溢出。最终报告及截图见acceptance-report.md。下一步仅等待用户UI人工验收；未获批准不得合并/Production/继续修来源故障。

版本记录：1c35dca9a763e0d32999ead2f14747f86e57f041仅同步最终部署验收与两feature/用户D196决定；新baseline evidence前向绑定该提交DECISION_LOG精确blob，旧冻结ID/hash均保留，不更新截图哈希或能力标签。后续清单提交仍仅文档/证据，无运行代码差异。

最终前向证据门禁已PASS：main4a8c9bc24b00983d0d79150349adeed5a333a237，17 UI路径、0错误；全部历史evidence/capability逐项未改。产品测试结论以实际90与b734已完成CI为准，最新文档提交CI单独记录。
