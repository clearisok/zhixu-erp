# 当前状态
核实2026-10-13；GitHub main：8b3f3d811d05182ea1a7f3214eae9d530056fa04（PR103已按用户授权合并）。GitHub是实时事实源；随main/PR/测试/探测/验收/环境变化更新。

- D109原艾诺科HTTP长期接受及私密首页probe已合并；PR103精确head1de3078三项CI成功，无行级审查问题。此前source的Chrome启动超时、同提交重跑通过记录保留。
- D110当前任务feat/ainuoke-readonly-validation：完整当前账号合同发现前后两遍，均匀抽查最多80合同完整6087050，再复用既有页面投影寻找四流各3个代表合同。仅只读工具、测试和文档，尚未合并新PR。[任务](tasks/active/ainuoke-readonly-validation.md)。
- 上轮用户真实回传：认证成功、订单首页50/558，首合同颜色5/5、物料0/0。不能推广到全量。本轮扩大核对的凭据已请用户私下输入，真实结果待回执，不提前声明完成。
- 物料unit尚无已确认映射，不能跨材料加总数量；缺失数量仍unknown。完整分页与记录可解析不等于人工业务语义验收。全部合同指当前账号可见全集，不证明公司全局权限。
- 现有UI、SQL、Source/orderRead默认开关与生产路由不变。未修改真实账号/业务DB，不部署宁波/18443/18444，未绑定或启动持续写入，新PR不自动合并。
- 本轮新增Node审计8/8、Python66/66、typecheck/lint/server:build/build和root810/810通过；既有来源20/1skip、continuous29/1skip，Linux限定分支须由Ubuntu CI补验。基线71/71、readiness9/1skip；实际main守卫PASS（10页面/15能力/0 UI）；最终CI以精确PR为准。
- D105：真实四流持续按订单展示后才上线宁波。当前仍缺真实完整范围和代表单核对、单位口径、首次绑定/持续运行/人工验收；新增合同自动建单、主信息/颜色增量及完整分码UI未实现。宁波备份恢复、独立候选和上线授权仍独立Gate。
- 历史Quote扩展UI的8项失败及父测试失败未处理，不声明全项目全绿。旧冻结截图、现场观察与历史提交保留。

功能：[来源](features/AINUOKE_SERVER_SOURCE.md)；决策D105–110；[宁波方案](ops/ningbo-rollout-plan.md)。
