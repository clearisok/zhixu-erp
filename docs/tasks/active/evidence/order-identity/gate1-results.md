# Gate1 订单身份工程验收（2026-10-14）

核实main：064e3afaf7d08b3cb62907d4402f97d9c292f1e5；branch：feat/order-identity-and-contract-claim。规则批准/初始checkpoint c3d70a5；基础caab27e；完整工作流2aa3944。最终测试及证据提交在Git history中，避免自引用虚构SHA。

## 已确认工程

15项合成领域/HTTP/升级测试通过：并发同合同一次创建、来源身份变化拒绝、并发认领、CAS、有效目标转交、他人无授权不可改血统、自环/跨单环/并发双向环、准备幂等不建SO、审计失败回滚、权限即时撤销、DB历史保护、旧数据前向迁移不回填。新源码仅正式Server接口；旧Browser与根ERP存储不改变。

Chromium5项通过：实际session跟单认领/血统、准备保存读回、管理员转交、物控只读及1440/390宽度。已查看本机outputs/order-identity-ui/identity-1440.png和identity-390.png（仅合成数据）。这是工程UI验证，不冒称用户人工验收。样式仅现有Foundation和订单组件。

七角色22项回归；现有首次绑定/受控新增19项PG回归通过。npm test 817通过；test:release-baseline 71通过；typecheck、server:build、全lint、显式Server build通过。精确main源码基线PASS，7个UI路径已记录用户批准范围。CI新增两个G1命令，远端未运行，不能声称CI通过。

首次npm test因状态摘要与基线未对齐失败，已前向对齐证据并817全绿；首次UI测试异步条件错误已修正并重验；升级断言按runner返回文件名修正。开发过程失败保留，不以跳过测试达成通过。

## 自审与限制

合同号变化曾会被旧来源重试吞掉，现显式409。相同合同号不同sourceID也显式409，保留原唯一索引。旧通用POST sales-orders及quote/sales-orders均404，无隐藏按钮绕过。

旧演示按角色数组位置匹配账号，新角色现追加并补充合成账号，原六角色对应关系保持。认领/准备新权限只定义，不修改真实账号。

本Gate不提供商业采用/拟用报价候选；随Gate2以精确版本接入。现存共享CCT仍未切换，禁止将G1当作完整订单价格治理。准备为append-only历史，不具备执行/正式订单语义；需修改时建立新准备，后续Gate补充取消/采用关联再进入正式匹配。

无真实DB/来源写入、无部署、无自动合并。迁移仅一次性tmpfs PG；未知历史类型保持未分类。旧应用回退不会自动撤销schema，不建议未经演练直接换回旧镜像。G1新命令可关闭，但已有身份/准备记录必须保留。

## 交付状态

LOCAL ENGINEERING PASS。REMOTE DELIVERY PENDING：尚未推送本分支/创建PR，继承NETWORK_DEGRADED。#108和旧演示分支不被本提交替代或合并。独立PR与精确CI待送达后核实；完成前不建议合并。

更新时机：main/提交/PR/验收变化；保持工程、远端交付、部署、人工验收、Source激活五个维度独立。
