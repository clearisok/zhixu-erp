# 当前接力：精确新镜像与0044恢复验证

2026-10-23，codex/server-current-target-recovery，从clean c54baa4d466d6657a760ceb6ab36c94586c065d9继续；actual main d1dd4f0fcf9992d5c055c7b67b6832b635485680不变。原Gate7H全证据和四状态摘要保存于tasks/completed/2026-10-23-current-target-recovery-inputs，不覆盖原报告/feature/manifest。完整范围见tasks/active/server-current-target-recovery-2026-10-23.md。

本片仅四份恢复test/driver增量：新增0044非空覆盖，原compiled target服务enable/disable/reenable及历史重放，恢复前后原ID/回执和全库指纹，新DB拒绝旧未消费target permit。语法/scoped lint/纯10通过；实际镜像/恢复尚待，不能写PASS。保存source checkpoint后，从精确Git archive构建显式Server image，两个新随机owned项目用原运维工具做合成恢复。root唯一writer，既有reviewer只读。

旧长期62426候选仍8175/10月20日，最新357恢复image止0043；不改旧环境。当前监听3001/62326/62426；50426/59069未出现仅为观察，不是退役。原refs ebe4/4cf1、旧库/账号/Browser/卷/其他工作树保护。不读真实凭据或私密Source报告、不发请求或实际target启用、不切换50426、不部署/合并/关闭。Git降级不重推，Billing未处理不派CI。完整Goal active，原业务待决不默认。
