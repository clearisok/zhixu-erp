# PR130 与后续关账交付边界核对

2026-10-28；branch feat/order-closing-month-plan；本阶段 clean 输入 855401ba60de2732bb6cc0305390cc79862db958。只读 Git/GitHub 和既有验收证据复审，未修改产品、SQL、UI、权限或业务规则。此前状态逐字保留在 [输入归档](2026-10-28-delivery-reconciliation-input-state/receipt.json)。

## 已核实事实

- 既有 gh CLI 有界只读 GET 确认 main 为 869ee84dd0b31de6161011e4aa560678b244a64d；[PR130](https://github.com/clearisok/zhixu-erp/pull/130) 为 open/draft、未合并，head 61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，branch codex/persistent-cumulative-43-main-869e。
- 实际标题“feat: 收敛 Server 订单、生产执行与物流跟进链路”，正文已正确描述 G4–G7 累计范围。main→head 为180提交/705路径（docs460/其他245），新增0033–0044共12迁移，镜像总43迁移。过期的是本地最早0d70只读切片草稿及接力里的“小范围PR130”假设，不是当前远端正文。
- baseline、team-access、source 三个既有 check run 都精确绑定617并成功；未重跑。legacy status 返回count0/pending，不算第四项检查，也不证明未查询的分支保护策略。
- GitHub test-merge 664e8f63dfcdd393e6a3dc3c93d35d7d8bf61f88 的双父依次为当前main与head；tree 46900a09200739db4a9e528c33b8fdc5331abac9 与617相同。它是只读合并预览，不是已合并事实。
- 617→本阶段输入855为98提交/280路径（docs151/其他129），新增0045–0051共7迁移；这是后续Gate8，不在PR130或其三项CI内。上述数量绑定本阶段输入，不能冒称未来提交的实时差异。

## 证据复用与复审范围

144/144发布回归绑定c1f8e861f6491026c4943f498554256a640bd609；43迁移镜像及8/8恢复绑定6d27d1e7fa1079f1830511068ff070791df310ab；货款Chromium9/9绑定test source 01d112b98e02d8aaacb4af14b4fa4522d6d3c207、渲染制品6d27。6d→617产品/API/SQL/UI字节不变，只有测试/工作流/文档差异；01d→617仅文档。release guard及测试源码c1→617不变。617最终同main守卫PASS为504证据/11页面/66能力，不能借用当前855的568/12/68或168项后续工具测试。

既有只读reviewer核对冻结Git blob/hash、原build/rehearsal/QA回执、祖先及上述差异，未发现阻断617合并的P1/P2。617所有18条新增普通document revision均能沿旧规则到base ID，base原记录逐对象保留；后续post-base anchor修复不是617的前置。后续共享业务差异主要服务Gate8，未证实必须先回补的缺陷。此为有界证据/差异复审，不是重跑或重新逐行审计全部705路径。

原证明：[43迁移候选](2026-10-26-persistent-cumulative-43-validation.md)、[货款测试](2026-10-26-payment-panel-ci-validation.md)。8/8只证明其Quote/附件/运维恢复范围，不能扩大为生产/物流等全部领域非空恢复、真实Source或人工接受。所有旧失败、日期、hash和限制保留。

## 交付顺序与保护

1. 先取得PR130具体合并授权；执行前再次只读核对main/head/checks未变，仅以merge commit保留原始历史。原Git/ref STOP_AUTH_OR_DIVERGENCE退出1根因仍未解；当前API读成功不解除Git写STOP。任何API元数据/合并例外必须明确限于此PR。
2. 合并后核对新main完整SHA、双父和tree，再前向整合到Gate8；按真实差异处理共享状态/manifest，运行新基线精确守卫及真正受影响检查。不得把Gate8塞回PR130，不reset/rebase/拆丢历史。
3. Gate8精确交付/必要CI及唯一草稿PR另行完成。当前本地cf77/0051恢复、243业务及持久空候选证据继续各自绑定source；不冒称远端送达、合并、部署或用户接受。
4. 88个相关本地refs按历史包含关系分类：9已在main、41在PR130、6仅后续本地、32未包含于当前历史。它只是交付定位，不是代码缺失证明或退役清单；所有retirementApproved=false。旧工作树、运行依赖、卷、备份和Browser均保持。

私密原始观察、merge-packet、ref明细、远端正文及两份前向PR草稿位于 outputs/gate-delivery-reconciliation-20261028；早期delivery-scope和0d70草稿原件不覆盖。远端写0、Hosted新增0、fetch0、真实Source0，没有合并/关闭/部署/既有账号或业务库操作。

本阶段仅文档收口；产品/SQL/测试/guard/manifest不变，复用原精确source的成功检查，不重复完整测试。新文档不虚增能力或冻结截图证据；568条历史记录保持原字节。工作区精确守卫结果另记CURRENT_STATE，不预写通过。

## 实机边界

http://localhost:62411/closing-center?year=2027 为合成Server演示，source fde8，非正式持久目标。现有tab5显示仅外发：2月/11月各10件/CNY1000/USD25，全年CNY2000/USD50；旧用户输入和预览保留。本片定向Return后仍未打开调整弹窗，tab4仍发生CDP focus超时；未重复提交或重置，不把自动操作尝试记作PASS或据此直接认定产品缺陷。截图live-demo.jpg已保存，用户可手动体验；新持久空候选62428未导入演示数据。

整体Goal继续active：三处具体配套UI与执行归属恢复规则仍待既有答复；真实来源、正式切换、人工验收和旧依赖退役分别需要范围。核心关账UI已经批准，不重复询问。
