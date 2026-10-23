# 最终业务PR历史组合验证

2026-10-23，Asia/Shanghai。root唯一writer，既有独立审查者只读。完整G1–G5目标继续；这是本地验证引用，不是GitHub main合并、重复累计业务PR、部署或来源激活。

## 已核实基线

- 独立API于10:44:55.345Z核对main=d1dd4f0fcf9992d5c055c7b67b6832b635485680；#123 open draft head=cb1658d97485bbf6c529660fffb50215548fffcd，#125 open draft head=ca05d3e75d3b28be44184a5ef645c9f24e6f38d3，均未合并。
- 原候选codex/server-garment-collection-control@1962d7bff59d29e718673f49a6c2a24a30ac061a：最终精确d1dd守卫PASS；既有工具一次push正常DELIVERED_VERIFIED，独立SHA/tree66a0fc94/父e7b3一致，dirty为空。其134/134绑定e7b3，9/9非空恢复绑定65545 driver和原357镜像，未重标成1962的新CI或新镜像。
- 从最新已核实main建立codex/server-final-pr-combination，FF1962，再普通no-ff merge原CB/CA。各自与1962均有两个merge bases：main与旧原PR头ebe4/add2，未挑一个作为唯一基线；没有reset/rebase/force/clean。
- 原本地feat/business-operation-logs=ebe4cb16、codex/server-persistent-empty-target=4cf19e82等运行态引用保持。所有旧用户环境、端口、容器、卷、Browser/对象/数据和账号均不操作。

## 第一笔：合流#123完整历史

实际五冲突：三共享摘要、manifest、order-business-source.integration.test.ts。TS冲突是CB早期整合删除了候选较新的精确数值隐藏负测；保留候选原blob，含合法UUID尾数120不误报、确实存在数值120会被识别的两个哨兵。原逐字段金额权限断言保持。

自动合入team-access-ui的18行差异：真实初始GET先等待，证明查询disabled；释放原fetch后确认已完成/可见/连接且可用，再单次点击。owned Browser.close/pending清理及直接mkdtemp目录校验保留，不扩大预算、不循环click。两个共享Chromium helper blobs此前已相同；更正上一接力“三个helper”的非阻断笔误。

原309与CB222证据无ID碰撞，并集311，59能力及其各状态完全不变；DECISION两叶将在真实merge checkpoint后以新mergeOf记录收敛，不重写原ID/日期/hash。双方三摘要及manifest[按原Git字节归档](../completed/2026-10-23-final-pr-combination-inputs/)。新组合测试尚待，不把原CB、CA或1962结果冒充本次。

## 第二笔及验收契约

第一笔实际merge及文档绑定后，正常合流CA；保留全部原历史和证据。预分析三父证据并集315、无碰撞，DECISION三叶、CLOSING两叶；具体最终数量以逐次真实merge与新见证为准，不预报PASS。

每笔检查实际父提交、各父全部证据对象、归档原字节、源码等价及旧运行态refs；仅root维护共享摘要。产品/SQL/UI/构建/ops应与1962一致，预期唯一非文档变化为CB的team-access-ui夹具。若出现额外变化先调查，不按“只是文档”放行。

最终冻结后执行精确main守卫、发布134负向/响应式套件、受影响PG来源权限与实际built角色/用户/日志验收，必要的scoped lint及共享浏览器保护单元；无变化的全项目历史验收仍保留各自来源范围。独立审查完成后只交付验证引用，不另建累计业务PR。

GitHub Actions已证实因账号付款/支出上限拒绝启动，用户确认未处理；不重跑、不改账单、不标代码失败或CI PASS。新增真实查询/采集额度、激活、调度、真实账号/业务库、50426切换、其他PR合并关闭、关账待决与旧资产退役均不因此获批。
