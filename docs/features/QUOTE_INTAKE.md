# Quote Intake V1

> 2026-10-10：**普通电脑两步原子创建已实现；Intake/手机收集/转换及已有报价类型切换 NOT IMPLEMENTED**。正式规则QI-01–06见 [BUSINESS_RULES](../BUSINESS_RULES.md)，Active D-101；实际子集/DTO/事务/测试见 [两步创建证据](../tasks/active/quote-two-step-creation.md)，剩余技术提案见 [原实施契约](../tasks/active/quote-intake-v1-implementation-contract.md)。本文件的Intake权限/生命周期/附件转换仍为未来方案。

## 领域边界

| 实体 | 权威职责 | 禁止混用 |
| --- | --- | --- |
| Intake / Style Capture | 待完善的款式收集资料、原图、可信 creator、版本及转换来源 | 不分配报价编号，不生成虚构报价历史 |
| Quote | 正式报价聚合、Server 编号与默认 Revision 指针 | 不用 Intake 状态代替 Quote 状态 |
| QuoteRevision | 一次完整报价快照、Revision 级 QuoteType、历史不可变 | 不把 QuoteType 放到单一 PV |
| PriceVersion | 并列价格方案、数量、成本及制作参数快照 | 不动态引用预设覆盖历史 |
| SalesOrder | 独立订单及来源/共享确认事实 | Intake 转换不自动创建订单或交期计划 |

手机拍照/款号/可空数量/成衣交期/备注连续收集；电脑查看同一 Server 收集箱，完善资料并进入共同两步新建。跨设备由可信 session + Server 持久化提供，不用 Browser Repository/IndexedDB 同步。当前 loopback Preview 不能被本契约当作手机可访问环境，实际手机 HTTPS/网络/相机权限另行验收。

## 所有权与权限

默认 creator 本人可见；团队读写需显式范围权限，与 quote.create/view/edit、成本/设置权限分开。actor/creator/time/ID/version 均由 Server 提供或校验；管理员名称不绕过。附件 owner 是 Intake，不借用不存在的 Quote ID。转换时保持收集 creator，不用转换操作者改写作者；另记 converter。

技术提案：独立 intake.create/read/edit/convert 与 intake.read_all/edit_all/convert_all，最终键名由主 Codex 在实际 DTO/RBAC 实施时核对；复杂权限变更必要时独立审查。不自动为任何角色增权，不把收集权当作正式报价权；receipt 仅返回已授权的最小结果，完整 Quote 另需 quote.view。字段与权限矩阵在实施契约。

## 生命周期

技术状态提案 collecting → ready → converted，另可 archived（不删除）；ready 只是收集完成标记，不保证 Quote 业务节点完整。成功 converted 冻结资料与图片集合、源版本及转换快照；Quote 后续编辑不反写原 Intake。数据库保证一 Intake 一 Quote；重复款号/同图可独立收集。失败不伪造成功或进入下一款。

原始数量 null 表示未知，0 是明确的零；Decimal string 与 NUMERIC 精确保存。成衣交期使用合法 YYYY-MM-DD 或 null，禁止 UTC timestamp 转日历日。原图不物理删除；保留/删除/GC/对象策略属于未来独立审批边界。

## 附件和转换

复用 AttachmentStorage 的 put/head/get 与 MIME/signature/size/SHA 校验；独立 Intake 元数据、上传 token、顺序/主图约束。0008 要求 quote_id 非空且有 FK，不能为速录伪造 Quote 或弱化旧约束。

技术建议采用 copy-on-convert：源图不动，按受控 manifest 为目标 Quote staging 新对象，最终事务写正式附件关系及映射。Staging UUID 不等于正式报价创建/编号。对象写入与 PostgreSQL 不是分布式原子事务；校验后再提交 DB，失败保留可恢复 staging/未引用对象证据，不自动删除。重复请求复用 manifest，不重复生成 Quote。正式关系只允许已验证可用对象，订单/来源/旧 Browser 图均不参与。

现有服务支持 JPEG/PNG/WEBP 图片签名校验，技术上限在现有服务/0008 中；不是 Intake 产品限制已获用户确认。HEIC、EXIF 策略、图片数量/容量限额、离线同步仍需单独技术/产品评审，不能默认转换或去元数据。

## 两步创建与切换

第一页明确类型/国家/active preset，多个预设不能静默选首个；无预设/国家待设置允许进入第二页。第二页显示参数是否来自用户/已确认预设/技术默认，完善基础资料；预设维护在独立设置页，返回后保留草稿，主动刷新与确认变更。最后只调用共同可信创建命令。转换额外校验 Intake version/范围与图片，普通创建没有 Intake freeze。

普通两步创建已落实校验：非空salespersonId必须启用且属于所选active品牌；非空presetId必须启用且country与提交一致，缺失/停用/跨品牌/国家不匹配明确拒绝。preview一致读记录受审版本；最终事务重新读取/锁定归属、国家、状态及版本，漂移要求重新核对。资料拒绝发生在编号分配前；技术/审计故障回滚可能保留合法sequence gap，不回收编号。无preset允许待完善草稿，旧POST{}未收紧。配置metadata是**创建时来源快照**，不是对已有PV编辑的全新产品政策；后续设置不反写。Intake转换的额外校验尚未实现。

加工隐藏编辑保留内部成本公式、材料事实、客户确认和历史；纯工价摘要与含材料内部成衣价分开准确标示。经销恢复经明确确认后重新显示原明细，不自动应用预设。确认后新 Revision 切类型：检查任一 PV 及 exact linked CCT，保留 SalesOrder provenance/共享当前确认；旧历史只读。generic PUT 必须同样防绕过。无 preset 的 technical CNY 不能当作配置完成，具体状态方案见契约。

## 当前事实与后续验证

普通creation command/configuration metadata已实现并实际disposable/Chromium验证；Intake、转换及类型切换guard仍未实现，不以两步创建测试冒充Intake通过。新UI组件与typed client可复用，但当前source/imageSelection必须null，未来需要合法adapter/领域校验，不能伪造Intake来源。默认一个主Codex完成一个可验收目标；Preview、人工验收和批准后合并分开，新增migration先独立获批。A/B/C/D仅可选工作包；复杂数据库/安全/跨模块确有必要才独立审查，严格验证不减免。
