# 接力：品牌、账号菜单与导航体验

2026-10-30；分支 fix/brand-shell-navigation，base/main e37a131a7182a5488f440dcc8fde3ea66de1c6e4。六图及后续透明/缩小30%的具体批准见[范围](tasks/active/brand-shell-navigation-2026-10-30.md)。产品源码e4413f0fbb72736ebf0d5f750f73778c8a441e67。原图字节保持，新来源类别只记录未来明确应用。

本地构建、22浏览器、14报价API、18附件、30定向、类型/lint通过。首轮964项中23个失败（3旧菜单断言+20清单锚点测试），修复后12项兼容及59项基线定向通过；不要重跑已绿全仓检查。独立复审0P1/P2。源码及截图冻结见[验收](tasks/completed/2026-10-30-brand-shell-validation.md)。e460已精确交付唯一草稿 #138；首轮CI基线/权限通过，来源旧手机菜单测试失败。本次仅测试兼容及文档更新，三组受影响浏览器43/43通过，原失败保留，复审0P1/P2。

e37批准应用更新已READY；当前配置runtime/trial.e37a131a-334a3e41.conf。新备份、独立恢复121表/序列、34路径读回通过；公网后续宁波到公网21请求后超时但退出成功，完整公网仍未通过。最终readonly-preservation已核对两笔验证会话撤销，原业务/身份/旧资产均保持，状态DATA_PRESERVED_PUBLIC_ACCEPTANCE_PENDING。保留 outputs/pr137-approved-staging-update 全部原回执，不重跑备份/切换/Source；原最终PASS工具要求公网全套通过，不能绕过。

用户已批准本片同步体验站，未批准合并；下一步测试兼容提交精确门禁、一次推送和必要CI。已封装e460镜像；复用须证明新CI提交仅测试/文档变化且全部产品blob一致，镜像不改标。全绿后使用 outputs/pr138-approved-staging-update.mjs 执行新备份、独立恢复、隔离应用切换及公网核验，未执行前不记部署PASS。完整G1–G5/Gate0–8/R未缩减，旧环境/数据/卷/备份保留，#136不动，7bf3不重建，不新增Source。原完整接力在 [输入归档](tasks/completed/2026-10-30-brand-shell-input-state/AI_HANDOFF.md)。
