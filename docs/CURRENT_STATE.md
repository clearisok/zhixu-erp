# 当前状态：物料页已合并并完成staging发布验收

2026-11-12用户接受8f5b5d89并授权审计全部open PR、安全合并及staging发布；不操作生产。PR145已于16:27:27北京以merge commit合入main：c5133e9e9e7065dc4fe7672c0c88c75688e0c51f；双父/代码树/8f祖先均已核实。head c1d2538f的三项必要CI全部成功，自动审查1项P2筛选问题已修复验证并关闭。136保持原草稿（明确不merge、冲突），没有其他open/bot PR。

16:37升级至上述main，正常session/RBAC，本机demo未安装。5真实订单HTTP前后rows全等、620绑定/620物料head哈希不变；23人工业务表、3用户/权限、620原订单保全。迁移0。公网真实浏览器30视图及12尺寸/密度组合、颜色首列13字段、搜索/筛选/列设置/到料计划/明细/正常登录保护已通过；4采购明细实际单位千克/个核对。来源新鲜度如实显示历史，不额外采集。

**既有来源问题仍保留**：catalog_changed_or_over_limit，最后心跳11/11 15:52:35北京；5 queued/97历史failed/27053 complete不变。本轮不清保护、不重置队列、不额外登录源站；本机未启采集。新宁波监督/备份绑定已更新至发布SHA，source worker保持停用。

发布前配对备份20261112T070832Z-6f815f2d验证成功并离机51文件/2326134575字节哈希全等。新版本配对备份20261112T085113Z-54a2de65于17:04:28北京完成BACKUP_VERIFIED、原服务恢复；preserve-pause及最后运行核对通过。新备份在宁波，未另行宣称离机或重新恢复演练。旧版本镜像/配置/库/附件/卷均保留。

发布后公网完整操作链通过：正常身份订单中心按PI2610-181查询→实际staging订单详情→既有物料入口→颜色首列13列表格；D1992匿名深链接正常跳登录且returnTo不丢失、API401。0业务写/0源请求。main和staging仍为精确合并SHA，最终open仅136。本地仅增加发布交接文档，不另建PR/重复CI；未进入staging的完成产品改动为0。

源码/证据审计基线仍6dc17c645215b3eb08e03624effdee2d182b3e1d；[发布与PR审计](tasks/active/material-staging-release-2026-11-12.md)，[此前状态归档](tasks/completed/2026-11-12-before-staging-release/CURRENT_STATE.md)。
