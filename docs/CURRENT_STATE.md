# 当前状态：0052完整恢复及新持久空候选已验收，PR131修复待交付

2026-10-28；分支 `feat/closing-support-interfaces`。最近独立核实main **6479a713e2b80228f008049519ebbd50d10601a8**，批准的PR130已merge commit合并；本片没有fetch或新的远端写入。0045–0052及界面已精确送达 **4584deb786e0dd2fada0d998a16d166b00ccaadc**，创建唯一[草稿PR131](https://github.com/clearisok/zhixu-erp/pull/131)；未合并或正式部署。

**能力账本校准**：新一轮只读API仍确认上述main和PR身份。52项旧未合并声明逐项核对原实现祖先，排除未实现intake后校正49项历史merged；六项旧认领/准备/归一写入口继续退役，关账和USD采用仍false。17条当前代码blob/Server owner边界、原记录与完整SHA见[冻结证明](tasks/completed/2026-10-28-convergence-capability-reconciliation.md)。只追加1条document证据（592→593）、前向更新两个财务scope；其他状态值、历史证据、运行快照、Source/环境/人工接受维度均保持。本片相关状态/证据回归10/10，无产品、SQL、UI、运行环境或新CI变化，不把历史包含当成当前功能全面可用。

**产品与体验**：精确产品 **a198d1829675092006708727624ee867be0e7b60**，来源数量复核、执行方匹配/无产出恢复、报价中心USD工价采用及历史已完成。canonical构建、类型、lint、实际Chromium18、项目811、发布182通过，原SQL夹具遗漏与修复分源记录见[最终证明](tasks/completed/2026-10-28-closing-support-final-validation.md)。[2027关账调整](http://closing-current.localhost:52251/closing-center?year=2027)，closing.editor或labor.editor，合成密码synthetic-closing。该库临时；旧62411/59846/62428及所有环境和输入保留。

**恢复工程**：原0052测试增量8/8、目录负控、11pass/1skip及回执4pass仍绑定[原源码和边界](tasks/completed/2026-10-28-closing-executor-recovery-engineering.md)，不覆盖为新结果。本片新a198精确镜像的完整非空重启、备份及独立恢复实际 **9/9、0skip**，含两个锁定期间、实际采用商业版本、无产出归属恢复、全库行/sequence及启动前0051/0052目录保护。汇总wrapper因TAP转义误记FAIL，原件保留；离线逐字编码往返和原件hash核对已校正，不重跑恢复。见[完整证明](tasks/completed/2026-10-28-closing-support-persistent-runtime.md)。

**镜像与持久候选**：原USTC构建失败保留；一次owned容器官方默认源GET200/TLS有效后，按原Dockerfile默认选项独立构建成功，未改共享网络/证书或宿主依赖。a198/3258canonical blob、0overlay、镜像 **sha256:90e36de7c3d61ca137b2d5a4227e848b83ed57579bd146ce25501dbc6fe35f4f**、51项迁移/最高0052及build-info精确核对。新 **https://localhost:65139** 为独立持久空候选，五服务healthy、四owned卷、两避冲突网段；121张public表中111张非白名单表全0，仅1名新技术管理员，重启前后计数/身份/迁移/完整保护摘要相等。原69容器/195卷/35网络的选定身份状态集合保持。旧62428仍cf77/0051，当前52251体验不变。新候选没有登录/业务写入/浏览器人工接受，不是50426切换；[精简回执](tasks/completed/2026-10-28-support-persistent-runtime/receipt.json)不含凭据。

**交付**：原a027超时没有抹去；用户随后批准4584精确例外，实际push1次、退出0、5373ms，工具Git/API及独立连接器均精确核实，未重试。过程仅覆盖本机进程代理7897，不改共享配置；本次NORMAL不是永久恢复承诺。[新交付和CI证明](tasks/completed/2026-10-28-pr131-delivery-and-test-compatibility.md)与[原失败](tasks/completed/2026-10-28-closing-support-delivery-attempt.md)分别保留。独立工具分支c91d904d8751275dd6a7830893ce237efa021905仍未上传；只有其已验收工具用于本次业务分支交付，两者不混淆。

**必要CI与当前修复**：三项首次Hosted：Release success，source与first-team分别被旧全库颜色count和关账路由false断言阻断，后续步骤跳过；没有手工rerun。只修两份测试，显式环境隔离/未知路由负控与全库身份原件比较加强，47/47、非增量类型、定向lint通过，独立复审0P1/P2。精确代码 **136ba1675c54d2ae147fdc50c72a99169aec6495** 的main守卫PASS；一次普通checkpoint上传发生新传输故障，工具/API与连接器均核实远端仍4584、新CI0。现为NETWORK_DEGRADED，原诊断一次3种只读方式均30秒超时，未重推或改共享配置；完整根因仍未定。后继仅状态文档收口，产品仍a198；不能借4584的Release成功声称修复已远端全绿。[原接线](tasks/completed/2026-10-28-closing-ci-integration.md)不增重复job/触发，缓存/并发取消/超时保持。

整体[Server收敛Goal](tasks/active/server-convergence-gate0-2026-10-20.md)继续active；具体远端恢复/必要CI、合并及目标切换、人工业务接受、授权来源和旧资产退役仍独立。未执行新真实Source读取/激活/调度、正式部署或既有账号业务库修改。本片恢复/镜像/新空候选之外未重复通过的检查；原状态及日期/hash/失败在[本片输入档案](tasks/completed/2026-10-28-support-persistence-input-state/receipt.json)保留，更早输入仍沿原链接保留。
