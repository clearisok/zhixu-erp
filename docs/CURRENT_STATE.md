# 当前状态：PR130已交付，正在修复旧货款侧栏测试调用者

2026-10-26；main基准869ee84dd0b31de6161011e4aa560678b244a64d，branch codex/persistent-cumulative-43-main-869e。原最终f8ed7f33c911cc1ec52cf3b3d9432912ac5aa80f已一次NORMAL安全推送，独立API精确核SHA/tree/父，唯一草稿[PR130](https://github.com/clearisok/zhixu-erp/pull/130)，未合并；合并预览树与原已验树一致。历史网络STOP/根因未完全确定的限制保持，未改共享配置。

首次CI baseline与team-access通过；source SQL/API、边界和构建通过，但货款侧栏浏览器旧“第一个按钮”选择器点中新增到货动作，连续超时后达20分钟上限取消，Python未运行。一次owned诊断已复现existing drawer超时；不是付款数据或权限故障。现在仅修测试调用者、依赖失败即停及编译源断言，不延长时限，不立即重跑CI；尚无修后PASS。

原6d镜像43迁移实际8/8、原c1的144与f8守卫/复审分别按原source保持；后续不重新build/重跑已通过8项，不把其结果归新test commit。新定向检查/实际浏览器、最终守卫和复审完成后才一次集中交付。旧环境未改，工作区原状态已逐字归档。

完整G1–G8/R继续，非空新增域恢复、稳定跨次成衣事件/更正、关账三项、真实Source具体授权/激活、目标人工接受与切换、依赖审计后退役仍有后续。不把当前候选称main或正式上线。3001/50426及全部旧账号、库、对象、卷、备份与Browser数据保持。

[当前阶段](tasks/active/payment-panel-ci-recovery-2026-10-26.md)。
