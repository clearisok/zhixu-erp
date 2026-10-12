# 当前状态
核实2026-10-12；GitHub main：9ebdf3b46b471e227e86a86c36f705e7ac6e6908（PR100/101/102 已合并）。GitHub 是实时事实源；随 main/PR/测试/验收/环境变化更新。

- 用户接受同一本机合成登录/报价导航/订单/物料体验，并单独授权合并PR100；真实来源覆盖/金额/持续运行/上线未人工验收。历史工程证据保留于[统一演示](tasks/active/unified-local-demo.md)。
- PR102无DB只读连接检查已合并，三项CI成功。当前修复PR98的文档冲突、过时上线顺序和归档链接，保留原现场快照；见[修订记录](tasks/completed/2026-10-12-pr98-reconciliation.md)。
- 用户确认原公网HTTP仍在用。无凭据HTTP200，同端口HTTPS握手失败；宁波到HTTP端口可达但最后一段保护未证明。用户本轮已明确长期接受该艾诺科HTTP风险；对应显式接入支持在独立分支开发，尚未真实登录，不读取真实密码。
- 现有P6/UI、默认orderRead/Source disabled、SQL与生产路由不变。没有修改真实账号/数据库或部署宁波、18443、18444；新PR不自动合并。
- D105保持：真实四流持续按订单展示后才上线宁波。完整合同范围/字段/单位、私密凭据、首次真实绑定、连续运行、完整镜像、备份恢复及人工验收仍待Gate。新增合同自动建单及主信息/颜色增量未实现。
- 本轮类型/lint/server与完整build、root810、基线71、实际main守卫均PASS；Python60、来源20/1skip、continuous29/1skip、新探测8/1skip。Windows不执行Linux私密文件分支，该分支由Ubuntu CI实际验证，不将skip记为pass。最终CI以PR精确head为准。
- 历史Quote扩展UI在旧main与PR101均69/78、8个相同失败+父测试失败，未解决；不声明全项目全绿。宁波方案已对齐D105，历史预检的时间/版本不改写为本轮观察。

功能：[来源](features/AINUOKE_SERVER_SOURCE.md)、[登录](features/SERVER_LOGIN.md)，决策D105–108。旧冻结证据与部署观察日期保持。
