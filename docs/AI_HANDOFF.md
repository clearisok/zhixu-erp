# 接力：品牌、账号菜单与导航体验

2026-10-30；分支 fix/brand-shell-navigation，base/main e37a131a7182a5488f440dcc8fde3ea66de1c6e4。用户已按六图批准本片界面及慢路由修复，见 [实施与授权](tasks/active/brand-shell-navigation-2026-10-30.md)。开始干净；当前源码/定向测试已完成，准备构建与浏览器验收。原始用户Logo字节保持，使用SVG显示视口。新来源类别只记录未来明确应用，不反推旧行。

30项定向、类型和定向lint通过；复审发现收起侧栏裁剪后改body portal，需验证焦点/手机/离开保护。尚未完整测试、CI、交付、合并或部署本片。不要重跑已绿旧版本验收。

e37批准应用更新已READY；当前配置runtime/trial.e37a131a-334a3e41.conf。新备份、独立恢复121表/序列、34路径读回通过。公网独立进程第一次中断，第二次build-info前超时；浏览器刷新已加载e37，完整公网读回仍待。独立验收新会话已精确撤销，原会话保持，第二次无登录。保留 outputs/pr137-approved-staging-update 全部原回执，不重跑备份/切换/Source。

完整G1–G5/Gate0–8/R未缩减。所有旧环境/数据/卷/备份保留；新UI不自动merge/deploy，#136不动，7bf3不重建。原完整接力在 [输入归档](tasks/completed/2026-10-30-brand-shell-input-state/AI_HANDOFF.md)。
