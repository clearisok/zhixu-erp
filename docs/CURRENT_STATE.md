# 当前切片：侧栏折叠定位修复

2026-11-01；main已通过GitHub API核实为 cb5cc29baa49ed7115fdb6c9506b6a80356936ea。独立分支 fix/sidebar-collapse-alignment，仅修复 app/foundation.css。用户明确确认“菜单位置保持一致，正文可扩展”。桌面折叠原+4px横移/-78px上移，已恢复为0位移；正文保留186→78px扩展。菜单功能、权限、Compact及触屏导航不变。

真实组件+正式CSS合成浏览器：三种桌面宽度和三种响应式状态通过；已有相关测试28项通过。构建/源码门禁结果见[本片](tasks/active/sidebar-collapse-alignment-2026-11-01.md)及本机outputs/sidebar-alignment。不把本地浏览器验收称为宁波已更新；不重启持续同步，不改业务数据。

之前宁波物料同步与备份分别保留在 chore/ningbo-material-sync 1e1be260、chore/ningbo-trial-backup 53c61fcf，本片未重新检查运行状态。Git网络故障没有新恢复证据，不重复推送/CI；本片未合并或部署。完整目标仍未结束。[原main状态逐字归档](tasks/completed/2026-11-01-before-sidebar-alignment/CURRENT_STATE.md)。
