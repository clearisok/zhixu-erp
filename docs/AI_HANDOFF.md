# 恢复点：先补Source明确复核，再构建当前关账镜像

2026-10-27；branch `feat/order-closing-month-plan`；沿用main869ee84dd0b31de6161011e4aa560678b244a64d，无fetch/远端写，STOP根因未解。

G2g source78ba35706429e020d5e613074c94357e72fdef8d规范archive3193blob/0overlay，controls24PASS/1actual-image设计SKIP、lint/只读窄审通过；[准备证明](tasks/completed/2026-10-27-closing-current-image-preparation.md)。outputs/closing-current-image-recovery-20261027/prepared.json绑定该source，build=0/rehearsal=0；勿在后续新source冒用其身份。

Source-ledger夹具真实刷新primary订单/颜色100→120，当前计划仍100，金融seed调月会正确source_changed。先实施D169明确Source数量/颜色复核，保留旧计划/冻结数量/执行归属/商业与财务快照，不换SO或覆盖计划骗过验收。复用既有month preview/commands/receipts、fresh权限/CAS/幂等/审计；新量按当前可信Source总数/颜色校验，不能自由输入财务数量。具体新后端需后续测试与SQL保护，不接未经批准的新UI。

新network fixture仅两个新nonce项目、固定私有/28且prepare前核宿主/Docker，CLI/compose同private override。已知默认池耗尽，不重试、不清旧网；最终新source候选再集中build/rehearse。61104/source4107演示保持，不停止/重seed/热替换。旧环境/Browser/卷/备份/账号业务库保持；Git STOP不自动解除，Hosted0。完整Goal active，不能把模型或准备稿缩成最终完成标准。
