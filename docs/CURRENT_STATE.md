# 当前状态：PR130已合并，配套界面与归属恢复已批准

2026-10-28；feat/order-closing-month-plan；本片clean输入0900c2b0ae9bc875e91c4c124bb101f52d227250。用户“全部确认”已解除PR130合并、三处配套界面、无产出执行归属恢复的等待；[批准与合并记录](tasks/completed/2026-10-28-closing-support-and-pr130-approval.md)是当前依据，旧pending文档保留其历史日期。Goal恢复推进，不再重复询问这三项。

**main已核实为6479a713e2b80228f008049519ebbd50d10601a8**。[PR130](https://github.com/clearisok/zhixu-erp/pull/130)已转就绪并以merge commit合并，双父869ee84…/61704afe…，tree46900a09…与原已验head相同；保留原180提交/705路径和0033–0044。三项精确原CI成功，本片没有重跑，其他PR/分支未关闭或删除。实际部署仍未执行。

**Gate8本地前向整合。** 原0045–0051及fde8/243业务/Chromium9、cf77/de5非空恢复9/Chromium9、50迁移/0051证明保持原source。当前只整合新main与批准文档；568旧manifest证据不变，新base改为已验证main。新base精确守卫及后续UI/恢复验收待执行，不预报通过、不冒用旧base结果。

**下一步实施**：来源复核弹窗复用D175无金额display→执行方匹配及无产出漂移显式返回未分配→报价详情USD工价采用/历史。每片独立commit，按实际修改最小充分检查、最后集中必要构建/发布/CI及复审。旧普通调月/匹配409、原价格/数量/生产与财务冻结保护保留。

**实机与保护**：62411仍是fde8合成Server演示，用户已确认能登录及打开调月弹窗，不证明保存/金额/冻结或全业务接受。不得重置、重新登录追赶或覆盖用户输入。62428为原cf77/0051持久空候选，未切换/导入；旧61104/50426/3001、Browser、卷/备份和所有运行依赖保持。旧证明入口：[核心链](tasks/completed/2026-10-28-closing-chain-correctness-engineering.md)、[当前镜像恢复](tasks/completed/2026-10-28-closing-frozen-image-recovery-engineering.md)、[持久空候选](tasks/completed/2026-10-28-current-persistent-empty-target-engineering.md)。

**交付边界**：原Git/ref STOP根因仍未解；本次具体批准仅覆盖PR130 API元数据/merge，未重推或改认证/共享代理/TLS。新Git对象从API原签名payload按exact SHA入本地库；第一次格式hash不符明确拒绝后离线纠正，无伪造或refs写。旧outputs/本地依赖链接起始不可见，原Git证明仍在；新回执另存owned outputs，依赖仅复用相同锁文件owner，无安装。无新真实Source/调度、既有账号业务库、正式部署/切换、其他PR合并或退役。
