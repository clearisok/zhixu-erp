# 接力：Git上传预算对齐main b1，先完成一次最终门禁

2026-10-30；`fix/git-delivery-upload-budget`，比较基线`b1b24186a300b330f29a2950e507711555c35b6c`，起点90797a57d5b1de7b62b30948fb0fa66c2eb3d8aa。先读[本片](tasks/active/git-upload-budget-main-b1-forward-2026-10-30.md)、[状态](CURRENT_STATE.md)及原[工具工程](tasks/completed/2026-10-28-upload-budget-engineering.md)。这是本地前向整合，不是已交付/已合并；最终hash与验证后置记录。

1. 保留原c91、9c894/9079及main b1完整历史，不reset/rebase/force。只有两项非文档差异：scripts/git-delivery.mjs及其专用test；5项输入逐blob等于原c91。原79/79属于10月28日原源码，本片不称新跑；最终main守卫/完整发布回归集中一次。
2. 当前main已包含获准merge的PR135；其原三项成功CI不重跑。本机新b1镜像及断点恢复证明已准备，宁波仍562。新镜像部署问项已提交等待答复，不反复询问或把目标自动续跑当同意。
3. 当前Git客户端必须按实际监听端口做有界进程级覆盖；已证实旧静态代理端口无监听，用户实际客户端的新通道一次ls-remote/fetch成功。具体主机端口/进程/回执只在ignored outputs，不写共享配置、不换认证/关闭TLS，不据此宣称所有历史传输根因已解决。既有安全恢复常设授权有效，真正认证/拒绝/分歧或证书异常仍STOP。
4. 原三合同固定Source额度已消耗；不新查、绑定、激活、延长TTL或启动调度。保持旧端口/容器/卷/备份/Browser存储，完整Goal不缩成此次工具/镜像。
5. 本工作树ignored outputs含原79/144日志、本地合并证据和新门禁结果；禁止入Git或重复执行已完成的一次性helper。历史共享状态可从main b1及9079的同路径恢复，原任务/immutable evidence保留。
