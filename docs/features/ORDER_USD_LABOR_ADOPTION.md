# 订单明确采用 USD 工价：Gate8C

2026-10-27，D162/D164 的 Server 后端切片；报价中心是操作 owner，订单实际工价仍由原不可变商业版本保存，不另建价格系统。当前尚未接入操作 UI、正式部署或真实业务库。

## 确认与身份

- 新 `confirmation.save` 从已保存 PV 记录 `laborCurrencyAtConfirmation`；客户端不能指定，旧缺失不回填。已有 PV 确认时禁止直接改工价币种，使用明确后继 Revision 重新确认。CCT 仍优先，包括空值；不放宽其独立关联和币种校验规则。
- 采用只接受 USD CCT，或带 USD 确认时币种的新 PV 确认。零有效，null/历史缺失证据拒绝，不把当前币种倒推为确认时币种。
- 只使用原 Quote、固定原 PV ID。原 Revision 可直接采用；后继必须沿有界无环父链到达原 Revision，每一步都有专用 `revision.create` 同事务写入的唯一不可变创建审计。普通 PUT 不生成凭据；已有父指针、创建时间/人和版本坐标不可改。旧无可信凭据的后继不猜测，可从原版本建立新后继。
- 完整产品比较默认包括未知字段，仅排除明确的版本身份/确认和已知技术配置。材料、工序、原成本、数量、日期、汇率元数据和 PV ID 必须一致；另要求用户明确确认产品未变化。不会计算或换算工价。

## 采用、并发与读取

`POST /api/v1/quotes/order-labor-adoptions/preview|commands`，`GET .../commands/:requestId|history?orderId=UUID&offset=0`。仅 session authority；写入需要 fresh `order.view`、`quote.view`、`order.commercial.adopt`、`commercial.labor.view/edit`，不推导售价或成本权限。预览为 REPEATABLE READ READ ONLY，执行等待锁后重新读取事实。

显式选择一张物理 SO 与颜色，仅允许原 CNY 工价明确采用 USD；已 USD 仅允许金额和完整凭据完全相同的 no-op，不开放 USD→USD 再采用。混合选择中任一行越界整单拒绝，不静默跳过。成功追加 `labor_adoption` 商业版本。完整保留原 source/product/hash、售价/基准售价、数量快照、未选颜色和加工批次 consumption。新 `labor_confirmation_source` 只保存选定工价的精确确认凭据，不复制整份含售价的 CCT。通用后续售价调整须保留该字段。加工旧统一版仅凭精确原消费及产品证据转为一条 `colorId=null` 的订单级行，原批次与商业版本继续存在；新版头不再等于原 consumption 版本不表示批次丢失。

复用 effective fence、物理 SO 锁、terms→Quote 锁及 actor/request 商业请求命名空间；商业 head、Quote 版本和 CCT/确认凭据共同参与 CAS。订单完成/取消、历史 alias、新颜色映射歧义和产品变化拒绝。新命令尊重运行时/数据库暂停，历史请求可核对。稳定拒绝保存回执；未知 COMMIT 返回 unverified，只核对原请求，不自动重做。版本、head、审计、completed-only 回执同事务，真实 PG jsonb 字节预算在变更前验证。

0046 只扩展原商业类型、增加可空工价凭据与一张空命令表，无旧数据回填。归一直接引用和全行指纹包含新回执，不因此启用归一执行。关账继续读实际采用版本；旧锁定/未锁定快照不随本次采用重价，未来归属明确使用新版本。当前阶段税率更正、关账 UI、手工业务验收仍后续。

## 验证恢复

工程结果以精确提交及阶段验收文档为准，见 `docs/tasks/active/order-usd-labor-adoption-2026-10-27.md`。冻结工程按分源合计192项定向、811项目、类型/lint及构建通过，独立静态复审0 P1/P2，见[冻结证明](../tasks/completed/2026-10-27-order-usd-labor-adoption-engineering.md)。发布门禁与远端状态按独立收口记录核对，不以工程通过替代。无新真实 Source/激活、Hosted CI、Git/ref 写、合并、部署或现有数据库操作。
