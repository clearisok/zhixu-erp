# 当前状态
核实2026-10-13；GitHub main：6395db45bebe572c736cf4137a373e0f816be6c0（PR98、100–102已合并）。GitHub 是实时事实源；随 main/PR/测试/验收/环境变化更新。

- PR98冲突、旧Quote-first上线顺序和归档链接已修复，远端head99ff696的source/team-access/baseline三CI成功，2026-10-12T16:08:41Z按授权合并。原宁波现场观察保持旧日期/版本。[修订记录](tasks/completed/2026-10-12-pr98-reconciliation.md) / [当前上线方案](ops/ningbo-rollout-plan.md)。
- D109：用户永久接受原艾诺科HTTP风险。当前独立分支feat/ainuoke-approved-http实现精确origin+policy支持及本机私密终端探测，不设置到期续批；本HTTP增量尚未合并。[任务与证据](tasks/active/ainuoke-approved-http.md)。
- 真实只读连接已获用户执行回传：认证成功；6086103首页50/总数558，首个可见合同6087105为5/5、6087050为0/0。只证明首页可读；未核对完整合同范围、真实四流字段/单位，未激活Source/绑定/调度/页面真实数据，不把首合同0行推广到全体。
- 原P6/UI、默认orderRead/Source disabled、SQL与生产路由不变。没有修改真实账号/数据库或部署宁波、18443、18444；新HTTP PR不自动合并。用户已接受的是本机合成体验，真实业务验收待完成。
- 本轮类型/lint/server与完整build、root810/810、基线71/71通过；Python64、来源20/1skip、continuous29/1skip、readiness9/1skip。Windows的Linux权限分支skip不计pass，Ubuntu CI尚待远端交付验证。最新main基线守卫PASS：10页面、14能力、0 UI变化；见本轮final-gate证据。
- D105保持：真实四流持续按订单展示后才上线宁波。下一步先只读核对完整范围及有四流的代表订单，再提出具体首绑/持续采集计划。新增合同自动建单、主信息/颜色增量、完整分码UI未实现；备份恢复、宁波候选及人工验收仍待独立Gate。
- 历史Quote扩展UI在旧main与PR101均69/78、8个相同失败+父测试失败，未解决；不声明全项目全绿。旧冻结截图与部署证据保持。

功能：[来源](features/AINUOKE_SERVER_SOURCE.md)、[登录](features/SERVER_LOGIN.md)；决策D105–109。PR98未送达的174a7e5状态文档语义由本分支接续，原本地commit保留；不冒称它已随PR98合并。
