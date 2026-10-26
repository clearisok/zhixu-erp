# 恢复点：PR130货款侧栏测试兼容

2026-10-26；codex/persistent-cumulative-43-main-869e，baseline f8ed7f33c911cc1ec52cf3b3d9432912ac5aa80f。先读[当前任务](tasks/active/payment-panel-ci-recovery-2026-10-26.md)和outputs/payment-panel-ci-recovery-20261026的start/prepared/diagnostic。原f8已交付唯一PR130，首次CI两通过/source因旧事件按钮选择器连续超时后取消；不要直接重跑或延长上限。

本阶段仅测试具名事件按钮/fail-fast/CI expected source；新source checkpoint后在新owned runner复用6d镜像原dist作9项实际浏览器，test/render来源分别记录，不覆盖现有工作树dist。旧失败保留，未完成不PASS。原6d 8/8与f8 Hosted baseline不重跑/不冒称新head。最终守卫/独立复审后一次普通安全交付更新同PR，不自动merge/deploy/Source/旧数据操作。完整G1–G8/R与既有待决/切换/退役限制保持。

实际修后终态：test source 01d112b98e02d8aaacb4af14b4fa4522d6d3c207 / actualParent 49ff169b09e22f3891beab17ed2b6b605d168e31 / phaseBase f8ed7f33c911cc1ec52cf3b3d9432912ac5aa80f，renderSource 6d27d1e7fa1079f1830511068ff070791df310ab；canonical 2983 tracked files/0 overlay，复用dist 1211字节匹配文件。实际9/9、23202ms、0 fail/cancel/skip/timeout/overflow；语法/lint/YAML/8原phase体校验通过，旧50/179/27元数据changes=[]。完整原件hash见[证明](tasks/completed/2026-10-26-payment-panel-ci-validation.md)。下一步最终守卫/复审后仅更新原PR130，未交付新修，不称新CI通过。
