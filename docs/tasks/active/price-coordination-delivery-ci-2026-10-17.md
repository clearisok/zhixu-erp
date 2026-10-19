# D145恢复交付与CI复审

2026-10-17；main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。本记录前向补充原工程与最终复审证据，不覆盖旧观察日期、SHA或结果。

## 已完成的四分支交付

| PR | 分支 | 精确远端SHA | 本轮Hosted CI |
| --- | --- | --- | --- |
| #110 | feat/order-commercial-versions | e70deacfe446088677aa3d96e998436b730cb7af | source / team-access / baseline 全通过 |
| #117 | feat/order-business-source | da46cdeb70e3785a760d6381c2e4974a57668a2a | team-access / baseline 通过，source失败 |
| #118 | feat/quote-order-sale-adjustments | 02e1eca080d91bf878bee9deb3817067e60bf90f | team-access / baseline 通过，source失败 |
| #119 | feat/processing-quote-push-and-selection | b1803280efba0159c49b45ef7833fa9237b1c518 | team-access / baseline 通过，source失败 |

四条均独立精确核实；#110/#117已更新，#118/#119为新建的唯一草稿PR，四条均attach到任务。没有合并、标为正式上线或部署。

用户授权每条最多一次、首次传输失败停止。实际正常Git push仅3次，分别为119/110/117，各一次；命令回执标记STOP_AUTH_OR_DIVERGENCE但远端字段精确命中目标。暂停后独立API及工具只读（无-Execute，pushes=0）均确认DELIVERED_VERIFIED，没有重推。119已包含议价原始commit，先核实GitHub可读取精确02e1eca0、分支ref为404，再通过现有GitHub Git refs API创建该原始引用一次；未上传新文件、重造commit或切换认证配置。

Source推送的本机进程级追踪只输出脱敏汇总：Git push退出1，remote-https子进程128；没有输出/上传原始trace、凭据或代理值。唯一push URL身份核验通过；无额外push refspec/mirror/followTags。GitHub引用已经更新，但完整原始错误没有保留，不能断言故障根因或长期恢复。工具把exact SHA同时标为TARGET_NOT_DELIVERED属于已确认回执矛盾，未据此盲目重推。全局代理、TLS、凭据、证书验证均未修改。

## CI失败的具体原因与本地修复

失败run：117=`39012095681`，118=`39012486393`，119=`39012505963`；均停在`test:order-commercial`的七角色测试。旧断言要求已采用订单的业务来源预览/写入再次成功200；D145明确订单中心只能首次采用，实际409正确。不是放宽新规则来迎合测试。

修复只修改`server/integration/order-commercial-roles.integration.test.ts`及状态记录：

- 已有价格的预览和新请求写入应409且版本仍只有1；无权限仍403。
- 每个角色使用新合成可信合同，独立验证合法首次预览/采用；未授权写入为零。
- 售价/工价字段脱敏、审计读取和旧订单CCT写保护继续覆盖。
- Source阶段管理员/跟单经理可首次采用；议价阶段按已实现的角色预设，报价经理也可采用。测试分别明确期望3/4个商业版本，不从测试里反推或修改生产权限。
- 首次采用命令必须expectedVersion=0；有效旧载荷再次提交触发409。不能把无效载荷400错当权限验证。

本地修复：#117 `f43bfdae2d09b2450edf0c7f0cf7c599686f41a6`；#118 `4d2bad59c761c2fe9f6118c25b04fc48e0464010`；加工整合起点`fd9de14e304f8a11ef8163ba2300a2112323ae6e`保留上述原提交，最终文档checkpoint另记录。Source/议价各31商业回归通过，Source类型/lint及两阶段精确main守卫通过；加工31/类型/lint/94基线与最终守卫收口结果写入CURRENT_STATE/AI_HANDOFF。

生产业务源码、SQL、权限、UI及冻结价格证据均未修改，不重复冒称全部业务和浏览器验收。原898/261/81/26和最终33/8等保留各自真实源码与限制。

## 下一交付边界

原四指定提交的恢复交付已完成，不能把旧授权中的每分支一次扩大为无限重推新修复。新范围在完成本地验证后提交具体SHA：最多上传加工整合一次，精确核实后仅将117/118安全快进到已经上传的原始修复提交（force=false），保持原commit历史，触发并检查新CI。旧红色CI不称PASS，也不重跑旧SHA来掩盖测试问题。

无真实数据库、账号、既有演示62316/62326、艾诺科读取/预算、Source绑定/激活、持续调度、宁波或18443/18444操作。新测试仍只使用随机一次性合成库。原始工作树及提交保持，不自动合并部署。

最终本地Gate：Source f43bfdae、议价4d2bad59及加工fd9de14e均各31项商业回归通过；类型/目标lint、94项发布基线回归及精确main守卫通过（11页/46能力/71UI路径）。相对原b180生产代码、SQL、UI与权限零变化。新修复尚未远端交付，旧三项source失败保留，不伪称新CI通过。
