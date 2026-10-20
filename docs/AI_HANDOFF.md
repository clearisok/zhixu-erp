# 恢复点：Gate6B排单UI源代码，尚待实际built验收

2026-10-20；Goal active/no budget；main996dfedc12da3527343cd3ff2aa5eea35497e10e。
codex/server-production-planning；root唯一writer，既有reviewer只读。
本Phase输入为干净6524c7d0b24f60e96c0abb39be4fa3e194ed7b4a，[三摘要原Git blob归档](tasks/completed/2026-10-20-gate6-inputs/planning-ui-6524c7d0/)。
6524已精确交付，Source39446392644/Team39446399962/Baseline39446406949全部success，各只调度一次。
原15295/70cb读取层115/927/116及234/49证据保持，不当作新页面验收。

源增量：读client白名单/分页/历史、精确字符串form、Server页面及authority wrapper，复用资源分页picker，
AppShell仅恢复原production-scheduling菜单/allowlist，V1路径影响server-production-planning-page.json。
order detail抽屉覆盖内部/外发计划；组队列更多菜单、全局分页订单池、显式预览/保存/历史。
无实际完成/运输/价格/迁移/新权限，缺数据不显示零或无风险。

安全：完整session对象lease，缓存原actor/tab单命令，GETunknown后独立人工重试相同requestId/intent/hash；
proof绑定lease和缓存字节，pending/网络错误/mismatch不准重试；新登录重新核对。使用protected router及未保存/未核对离开保护。
取消/重排预览等待禁用输入。SAVEPOINT期待HttpError404/409/422回滚后持久rejected；客户端核验内容hash，裸422仍未知。
33实际PG/API含跨SO499→500容量场景已过（20664.3349ms），27单元/表单（595.9346ms）、全TS/Node过；lint/浏览器/最终回归待收口。
首次TS一处可空state、lint测试unused警告保留；新harness production-scheduling-ui.integration.test.mjs只用一次性合成库/私有Chromium。

下一步：完成source checkpoint，process-only六build env精确Server build→再串行Node build/app导入，运行该built UI与已有资源/导航回归。
Frontend build会清dist，不能与Node build/app import并行。不拿旧静态测试冒称实际浏览器通过。
之后项目/基线/相关SQL回归、冻结新的UI工程证据/能力记录，main996最终guard、有界一次交付/独立SHA与三个新CI。
本Phase还没有新页面Gate PASS、GitHub交付或新CI，不升级62426（仍8175）。

持续安全Git恢复授权有效，不逐次再问；不改共享Git/TLS/proxy/auth，不合并/关闭#120–127、不建重复累计业务PR。
不动3001/50426/59069/62426、旧卷/Browser/工作树或真实账号/业务库；无新艾诺科范围、部署或退役。
6C、出货、Server关账未完成；未来CNY销售/USD工价保持、不自动换汇。旧Quote45/44/2和31未启动缺口独立。
