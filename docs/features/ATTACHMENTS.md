# Quote Center 附件模块

## Purpose

附件模块为单张 Quote Revision 提供图片和文件管理。图片可预览并指定款式图；普通文件只允许下载。模块当前属于纯前端原型，不接入根路径 ERP API。

## Current behavior

- 报价详情使用一个“附件”Card，固定放在当前报价明细的最后：面料成本 → 辅料成本 → 工价 → 其他费用 → 附件；即使没有附件也保留空状态和上传入口。
- 历史 Revision 的附件 Card 保持相同位置，只允许图片预览、图片下载和文件下载。
- 图片支持 JPG/JPEG、PNG、WEBP，多选上传、限定 Paste Area 的批量剪贴板粘贴与批量拖放、缩略图、上一张/下一张预览、持久化重命名、下载、删除和设为款式图。
- “粘贴图片”Modal 打开后自动聚焦 Paste Area，只监听该区域的 `paste` / `drag` / `drop`；一次可加入多张图片，也可反复追加。待添加图片先进入预览网格，可逐张移除；取消不保存，确认后才批量写入 AttachmentRepository。
- 剪贴板图片生成 `pasted-image-YYYYMMDD-HHmmss-001.ext` 形式的唯一文件名，同一批次按三位序号递增，并与上传图片复用同一个 AttachmentRepository 保存服务。
- 第一张成功上传的图片在尚无款式图时自动成为款式图，后续上传不自动覆盖。
- 基础信息右侧款式图读取 `styleImageAttachmentId`，点击后进入同一图片预览。
- 删除当前款式图必须经过二次确认，确认后款式图引用清空，不自动选择替代图片。
- 文件支持上传、文件名/类型/大小/上传时间/上传人展示、下载和删除；没有 PDF/Word/Excel 在线预览。
- 历史 Revision 可预览和下载，但不能上传、删除或修改款式图。
- 单款 SalesOrder 复用同一附件 ID 与 IndexedDB Blob；报价生成订单时复制附件引用，翻单继承引用。订单附件面板可上传/下载/预览并修改引用，但不会复制或直接删除底层 Blob。

## Business rules

- QuoteRevision 只保存附件引用快照：`imageAttachmentIds[]`、`fileAttachmentIds[]`、`styleImageAttachmentId`。
- 款式图只是图片附件 ID 引用，不复制文件。
- 创建新 Revision 时深复制附件 ID 数组；底层 Blob 不复制。
- 新 Revision 新增附件不修改旧 Revision 的引用数组。
- 从当前 Revision 删除继承附件时，只要其他 Revision 仍引用它，底层 Blob 必须保留；无引用 Blob 在保存报价后清理，放弃未保存修改不会误删原附件。
- 历史只读 Revision 的附件关系不可变。
- 图片重命名只更新 AttachmentRepository metadata，保留原附件 ID、Blob、MIME 和扩展名，不改 QuoteRevision 的附件引用快照。
- 粘贴图片与上传图片遵守同一款式图规则：款式图为空时第一张成功保存的图片自动成为款式图，已有款式图时不覆盖。
- 批量确认采用全批次成功语义；中途保存失败时补偿删除该批已写入项，并保留 Modal 中的待添加图片供用户重试。
- 不支持视频附件。
- 删除 Quote 附件 Blob 前必须同时确认没有任何 Quote Revision 或 SalesOrder 引用；从订单移除附件只移除 SalesOrder 引用。

## Data model

`features/quote-center/model/quote-attachments.ts`：

```ts
AttachmentViewModel {
  id
  name
  mimeType
  size
  kind: "image" | "file"
  storageKey?
  createdAt
  createdBy
}
```

QuoteRevision 的附件字段位于 `quote-view-model.ts`。旧 `garmentMedia` / `quoteDocuments` URL 数组仅作为 mock 数据兼容字段，新代码不再向其中写入。

## API and persistence

- 抽象接口：`features/quote-center/repository/attachment-repository.ts`，包含 metadata `rename(id, name)` 能力。
- 当前实现：`indexeddb-attachment-repository.ts`。
- IndexedDB database：`zhixu-quote-attachments`；object store：`attachments`。
- metadata 与 Blob 存在 IndexedDB；Quote mock repository 的稳定 localStorage envelope 中只保存附件 ID，不保存 Base64/Blob。旧 sessionStorage 只作为 Quote 数据迁移来源。
- 当前没有上传 API、对象存储、服务端病毒扫描、权限校验或跨设备同步。

未来真实后端可用 Object Storage/API repository 替换 IndexedDB implementation，业务组件继续依赖 AttachmentRepository 边界。

## Frontend behavior

- 主组件：`features/quote-center/components/attachment-panel.tsx`。
- 基础信息款式图：`quote-base-info.tsx`。
- 页面接线：`quote-editor.tsx`。
- 订单接线：`features/order-center/components/order-attachment-panel.tsx` 与 `order-pages.tsx`。
- `quote-editor.tsx` 将附件放在“其他费用”之后、当前报价表单的最后，并置于历史成本的禁用 `fieldset` 之外，以保留历史附件的预览和下载能力。
- Modal 通过 Portal 放在页面主 Form 外，避免嵌套 form，同时复用 Foundation Modal。
- Blob 预览使用临时 object URL，并在组件清理时释放。
- 待添加图片使用组件内 `pendingImages` 和临时 object URL；移除、取消、确认成功或组件卸载时释放对应 URL。
- 下载通过 Blob object URL 或旧 mock URL 触发浏览器下载。
- 可编辑图片菜单顺序为设为款式图、编辑名称、下载、删除；名称 Modal 默认带出现名，保存后立即更新卡片，并由 IndexedDB metadata 保证刷新后仍存在。
- 图片预览 Modal 采用受视口约束的纵向 flex 布局；Preview Stage 可收缩且图片使用 `object-fit: contain`，Footer 固定保留并允许窄屏换行。
- 可编辑 Revision 的图片页签提供“从相册选择”“拍照上传”“粘贴图片”；相册 input 使用 `accept="image/*" multiple`，拍照 input 使用 `accept="image/*" capture="environment"`，不支持 capture 时仍回退为标准图片文件选择。
- 手机上传继续经过 `saveQuoteAttachments` 与同一 IndexedDB AttachmentRepository；`savingRef`/uploading 阻止重复提交，并以状态和 Toast 反馈结果。

## Important constraints

- 不得把大文件转为 Base64 写入 localStorage/sessionStorage。
- 不得因为删除当前 Revision 的引用而破坏历史 Revision 仍使用的 Blob。
- 文件 Tab 不增加在线 Preview。
- 不得允许历史 Revision 修改附件关系。
- 不得把附件塞进 PriceVersion；附件属于完整 Quote Revision。
- Quote 保存与附件 Blob 保存当前是两个本地存储事务，真实后端阶段需要设计一致性和孤儿文件清理。

## Tests

`tests/quote-attachments.test.mjs` 覆盖：

- 第一张图片自动成为款式图
- 第二张图片不覆盖款式图
- 切换/删除款式图
- 图片前后预览
- 文件无在线 Preview
- Revision 引用继承和历史隔离
- 历史只读保护
- IndexedDB/no Base64 存储契约
- 粘贴文件名、Repository 保存、第一张/不覆盖款式图、非图片 Clipboard 和局部 paste listener
- 批量 Clipboard、批量 Drop、重复追加、待添加移除、确认后保存、失败回滚
- 横图/竖图/方图 contain 规则与 Preview Footer 可见性契约

## Known gaps

- IndexedDB 只在当前浏览器设备可用，不是生产级共享附件存储。
- 报价整体删除后的孤儿 Blob 尚无回收任务。
- 没有上传进度、大小上限、文件哈希、重复检测和安全扫描。
- 系统相册与摄像头 UI 需要目标手机实机验收；自动浏览器已通过文件注入验证多图、首图款式图与不覆盖既有款式图。
