# main前移后的post-base文档链整合

2026-10-28；工具片输入21d3cbf881375fc88780181f1e9ce5c68c5e3114，当前main6479a713e2b80228f008049519ebbd50d10601a8，真实整合H153c04a4627f6d78febd79e153d11d7e5cc0cd38双父为独立side0900c2b0ae9bc875e91c4c124bb101f52d227250和精确main。无远端Git/认证配置/CI操作。

## 复现与约束

实际新base守卫FAIL：旧Gate8中在869之后首次冻结的文档链，在main进入6479后无法用新base证明早先own-parent；不是产品失败。原source-baseline.log及旧guard新真实Git正例红测guard-red.log保留。绝不删除旧568项证据、改hash或跳过anchor来消除失败。

修复只接受M/S实际Git manifest的同一完整baseline B，同时验证B→M/B→S；真正精确双父H、有界完整父清单、独立M/S及exact同路径源叶。旧side每一段在B验证自己的直接父/完整链/原blob，全部旧节点还须精确存在S，不能在H恢复S已删除的根或中间项。H后U仍按M自证own-parent并逐节点保留旧链，不借H跳过当前前代；缓存按base/head/id和有效context分离，256节点/深度及64MiB预算保持。仅受限历史上下文认可exact S中的合法根，不开放当前任意根。既有双侧merge/screenshot/审批/状态要求不变。

## 本片实际验证与冻结顺序

原guard对合法新正例红测失败，错误为post-base-first及H anchor/leaf。新oldchain/H/U组13项通过，独立审查随后补出S完整成员和root-only边界；两个负控/限域根已修正，root-only S→H→U正例1/1通过。根正例首轮是夹具没有stage恢复side文件导致空commit，已保留失败并修正，非产品或guard失败。最终源码lint通过；完整release回归/实际新base守卫和最终复审仍待后续冻结完成后运行，不借中间通过宣称最终PASS。

本片追加8个153实际blob整合见证，保留原记录；来源配套UI证明和PNG分别冻结于21d3，产品渲染仍绑定d329，旧截图不变。来源feature当前已在d329更新，所以153见证暂与当前文档不同：先冻结H记录在本checkpoint，再从其后独立文档source更新/冻结后继，不能把d329冒称已经以新H见证为直接父。

工具独立复审角色仅只读，不修改共享文件。无业务/SQL/API改动，没有降低合并质量门槛或自动改截图。用户现有演示/输入、卷/备份与原ref均保持。

2026-10-28兼容修正：41f精确main守卫通过，但完整182回归实际180通过、2失败（v1允许补充已验证hash的历史字段兼容、共享DAG memo访问顺序）。统一沿用既有历史字段比较，导入side仍完整对象精确匹配；memo命中前保留context/成员检查，未缓存节点仍验证真实祖先。原失败日志保留。后续UI证据变动期间启动的2项检查读到未冻结feature叶，因EVIDENCE_WORKTREE_DRIFT失败，不能误报为兼容问题；先独立冻结da54的真实后继，再核对当前源码。最终完整回归仍须集中运行，不用局部通过冒充182通过。
