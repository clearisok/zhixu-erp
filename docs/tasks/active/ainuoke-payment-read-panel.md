# 合同级货款申请只读面板

核实2026-10-15，main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。Phase baseline：现有feat/ainuoke-payment-snapshot-storage@b75bc7a93fef219f365590404f1f5d0854add637、clean；在原树和原任务分支继续，独立Phase commit，不重建worktree/PR。GitHub为实时事实源，源码/授权/验证变化时更新。

已批准D121 Gate5/D134事件Drawer和独立6086941来源方向；本阶段只把现有对账tab接成合成工程候选，不重设计页面。D139默认关闭目标/无真实启用保持。真实过滤/分页、采集/写入/激活授权仍待，无凭据或上游读取。

事实：6086941候选字段中没有可直接等同6087050物料需求ID的标识，名称/规格相似不足以证明身份；前端只按可信SO/合同展示来源观察，明确未关联当前物料，不按名称过滤或假造物料对账。Num/OutStoreNum/bgNum/kpNum、金额和币种/单位各自保留，unknown不默认0/个/CNY，不求和，不认定银行实付。

技术范围：共同静态字段catalog与显式wire v1、严格有界同源只读client、登录/权限/订单切换清理旧响应、取消/失败不保留旧金额、基于服务端时效加单调计时的前端到期隐藏；仅打开既有对账tab时读DB快照，关闭/切换取消，无Browser存储或定时上游请求。复用Foundation、既有Drawer/表格/分页视觉。类型/客户端负向测试、一次性PG/API与实际Chromium多宽度/七角色/可访问性/截图及发布基线需验收后才收口。

范围批准不等于新像素人工验收；没有真实迁移/写入、Source首绑/激活/调度、宁波18443/18444、现有演示或部署。NETWORK_DEGRADED不自动恢复交付。

## 当前实际验收

150/150相关Node/PG/API、新财务UI9/9、原物料UI9/9、类型、Server及Server UI串行构建、完整源码lint通过。渲染源码cefe951d1de1a32763a1e7298e69b2560b1c282d/build20261015-231629；后续只测试/CI/文档，无产品源码变化。新六宽度/展开/过期截图与receipt按新路径冻结，原失败日志/截图不覆盖。完整root/基线/默认Browser构建及最终精确守卫仍待。原50字段顺序、0025字节、Source/G5原树和所有真实证据保持。

已修初轮React纯度、共享编译目录争用及测试tab计数定位；Source CI补full SHA（默认vite短SHA按代码会被新增测试拒绝），未声称Hosted已运行。恢复本feature与冻结read-panel-engineering-2026-10-15、UI scope、receipt。没有真实财务采集或物料级匹配，没有新增真实操作许可。

## 最终收口（2026-10-15）

150/150相关Node/PG/API、9/9新财务及9/9原物料实际UI、typecheck/Server编译/完整源码lint通过。串行Server UI渲染源码cefe951d1de1a32763a1e7298e69b2560b1c282d/build20261015-231629；后续仅测试/CI/文档，无产品代码差异。冻结报告/D140/新9PNG/receipt在994aa4bcca5d1e3f0fc55dbdcfae1add31b7ee17，前向manifest绑定9aa254c30401eed67da125f980ccf9a4cd6940e2。root898/898、基线94/94、精确main守卫PASS（11页/41能力/56累计UI路径），日志outputs/payment-panel-{root,baseline,bound-guard}.log。

默认Browser构建9aa254c3/build20261015-234232也通过（quote/master browser、session、orderRead disabled）；metadata存outputs/payment-panel-default-build-info.json。当前dist最后为Browser；下次Source UI验收须重新显式Server构建。新截图是合成工程证据/AI查看，不是新用户像素认可，未覆盖任何原证据。当前代码不能视作已真实激活。

真实过滤/分页、受控采集器、具体目标SO及实际迁移/写入/启用仍待；无新读取许可，不自动执行真实命令。旧Source/G5树/ref及原私有数据保持；Native Git NETWORK_DEGRADED未恢复，无新远端送达/PR/Hosted CI，不合并部署。此阶段完成不等于整个Goal完成。
