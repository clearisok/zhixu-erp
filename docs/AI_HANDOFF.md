# 恢复点：PR130货款侧栏测试兼容

2026-10-26；codex/persistent-cumulative-43-main-869e，baseline f8ed7f33c911cc1ec52cf3b3d9432912ac5aa80f。先读[当前任务](tasks/active/payment-panel-ci-recovery-2026-10-26.md)和outputs/payment-panel-ci-recovery-20261026的start/prepared/diagnostic。原f8已交付唯一PR130，首次CI两通过/source因旧事件按钮选择器连续超时后取消；不要直接重跑或延长上限。

本阶段仅测试具名事件按钮/fail-fast/CI expected source；新source checkpoint后在新owned runner复用6d镜像原dist作9项实际浏览器，test/render来源分别记录，不覆盖现有工作树dist。旧失败保留，未完成不PASS。原6d 8/8与f8 Hosted baseline不重跑/不冒称新head。最终守卫/独立复审后一次普通安全交付更新同PR，不自动merge/deploy/Source/旧数据操作。完整G1–G8/R与既有待决/切换/退役限制保持。
