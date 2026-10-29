# 关账月份与既有财务快照（D171）

2026-10-27，Gate8G2b。承接D169月份计划与D170执行方匹配，复用0045财务版本、期间manifest、原命令回执与订单已采用商业版本，不另建价格/收入/生产账本。

## 命令与数据所有权

`sync_month_outputs`使用既有`POST /api/v1/closing/preview`和`/commands`。输入只有periodId、expectedPeriodVersion、channels.sales/work及原因。服务端选取该月当前完整适用片段，不能传SO清单、数量、颜色、执行方、单价、币种或FX覆盖。客户端仍使用同一严格ClosingIntent与原请求核对机制，没有新页面/Browser仓储接线。

每个选中渠道从同一可信订单商业版本读精确颜色价格，复用原确认价资格与精确decimal税额公式。成衣CNY，工价USD；加工只有work。纯sales先剔除可信加工业务，不因其归属漂移而阻断无关合同；work选中后仍明确核对全部适用订单、未知数量、Source指纹和归属。未确认不补0、已确认0有效、非USD不换汇。仅closing.edit和对应金额查看/领域读取权限可明确采用，不授予任何报价修改能力。

0049新表`server_closing_month_financial_links`只保存allocation、物理SO、期间、原月份版本/行和渠道的不可变外键。每个片段sales/work各用一条既有0045 allocation，因此能够独立采用、保持另一渠道；价格仍只在既有snapshot里。相同片段不重复创建；确实改变数量/颜色/执行方时旧记录作废并保留，新片段显式建立引用。相同片段换已采用商业/生产观察时追加财务版本，原值和原引用保留。

一个期间的所选渠道整体事务成功或拒绝。fresh RBAC、actor/request advisory fence、全局生产锁、资源锁、期间CAS、预览指纹、审计、原回执沿用原服务。初次采用后再次相同请求返回原结果；不同内容不可复用原request。回执丢失先核对原actor/request/hash，不自动重做。新请求相同依据只保留财务行，不复制数量。

## 调整、冻结与兼容保护

开放期调月/匹配不会改写财务；旧快照暂时过期，确认/锁定必须核对当前所有已采用渠道完整覆盖。新增订单、片段拆分、整行换ID、数量或稳定归属变化均不能被遗漏；期间状态与原生产更正复核继续检查。锁定manifest永久引用当时0045版本，后续Quote Center议价不改旧价。

旧create/update不能再向已有关联历史的SO新增手工财务数量；linked作废也只能由月份同步命令处理。旧未关联有效记录会阻断相关月份采用，允许原作废恢复，但不自动合并/删除。旧兼容写入口尚未整体关闭；未来正式页面开放前须继续收紧，不能说本片已完成退役。

金额渠道数量不能相加当件数：同SO对应片段身份与量一致才去重；双渠道片段集合不一致时registeredQuantity=null，并明确requires_sync。旧手工记录仍按原记录语义分开，不冒充月份计划物理总量。当前旧明细金额仍保留原三项兼容格式；未来全年视图合并为成衣销售CNY/加工USD两项，缺渠道须标待采用，不能借旧空汇总0冒称已确认0。

linked行的共享reason可能描述双渠道，详情/历史保守要求双金额查看权限；每个金额及snapshot remark继续原投影。期间历史的采用渠道只读不晚于该periodVersion的已应用回执，避免用后来的work采用伪造早期历史。普通数量/生产归属不是商业金额权限。

SQL同时核对原月份行、单渠道、数量、颜色、assignment与保存executor_basis；活动片段/渠道最多一条，link不可更新删除。linked数量/渠道不能由review或旧命令改变。500订单、5000财务对象和1MiB预览/读取继续有界；新对象与投影字节渐进计数，不能先构造无限结果再拒绝。

## 工程与后续边界

实现证据：`server/closing/month-financial-service.ts`、原service/snapshot/read-service、0049、`closing-month-financial.integration.test.ts`。迁移不重写001–0048；0048非空升级不回填link，历史盘点注册完整关联行。测试只用owned disposable PG/HTTP，错误注入覆盖审计回滚与COMMIT丢失，不访问既有业务库。

本片实际结果分源记录于[当前阶段](../tasks/active/closing-month-financial-2026-10-27.md)，未执行的检查不预报通过。正式全年两项金额/同范围内外发汇总、月份计划HTTP/客户端、已批准页面、Source异常更正和新镜像非空恢复仍后续。68能力状态不提升，无实际像素/人工业务验收、真实Source、现有账号/业务库、部署、合并、退役或新Hosted CI。原Git STOP与本机工程独立记录。
