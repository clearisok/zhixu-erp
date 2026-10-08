# Quote Center 附件模块

## Purpose

附件模块为单张 Quote Revision 提供图片和文件管理。图片可预览并指定款式图；普通文件只允许下载。正式 Browser Quote Center 仍使用 IndexedDB；Q4A Server foundation 与 Q4B isolated UI candidate 均未部署/激活，不接入根路径旧 ERP API。

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
- 当前正式 Browser 路径没有 Server 上传 API、对象存储、服务端病毒扫描或跨设备同步；Q4A 的独立 Server API 见下节，不代表已切换正式 UI。

## Q4A Server foundation（工程实现；未真实激活）

- `0008_quote_attachments.sql` 定义 `quote_attachments` metadata/lifecycle 和 `quote_revision_attachments` 有序关系；UUID 由 Server 生成，关系精确 FK 到 `(quote_id, revision_id)`，一个附件可被多个 Revision 引用。同一 Revision 附件不可重复、款式图最多一个且必须是 image。PostgreSQL 不保存 Blob/Base64；metadata 包含原始/显示名、MIME、大小、SHA-256、kind、provider/container/key、可信创建人/时间及 upload token。
- `server/attachments/repository.ts` 持有事务、Revision/关系读取与兼容镜像投影；`service.ts` 负责授权、上传一致性及业务命令。`storage.ts` 是 provider-neutral put/head/get/remove interface；Q4A 只有 disposable-test 内存 adapter，正常 Server runtime **不默认配置 storage**，访问附件 API 会 fail closed。Production Object Storage provider/bucket、凭据与部署仍待选定；`remove` 只是未来 GC 能力，Q4A 从不调用。
- API 为 `/api/v1/quotes/:quoteId/revisions/:revisionId/attachments` 的 list/raw upload，`/:attachmentId` metadata/rename/unlink，`/:attachmentId/download`、`/:attachmentId/link` 和 `/style-image`。上传为 bounded raw binary（非 Base64 JSON），`name`/`kind` 查询参数、`Content-Type`、`Idempotency-Key` UUID 和 `X-Quote-Version`；mutation 仍需 exact Origin + `X-Zhixu-Request: 1`。服务端计算 SHA-256、验证图片 JPEG/PNG/WEBP signature；普通文件只拒绝 video、无效 MIME 与已作为图片的 MIME。100 MiB 是 Q4A 技术内存上限，不是最终产品大小/文件类型政策；产品政策仍待确认。
- 读/下载需可信 `quote.view`，上传/重命名/关联/移除/款式图需可信 `quote.edit`；历史 Revision 关系不可改，通用 Quote PUT 不能直接改已有附件引用。创建继承 Revision 时从关系表复制同一附件引用而不复制 binary。关系表为 Server 权威；Revision JSON 中三个既有 ID 字段是同事务兼容镜像。删除当前关系不会删除 object；无引用 metadata 标为 `pending_cleanup`，没有自动 GC。
- 上传先写 `pending_upload` metadata，再 PUT/head 校验对象，最后在 PostgreSQL 一次事务中提交 available+关系+兼容镜像+Quote version+可信 OperationLog。PUT 失败或事务失败保留可识别的 cleanup 状态；对象存储与 PostgreSQL **不是 ACID 跨系统事务**。同一上传 token 重放成功结果或 fail closed，绝不默默创建第二份。失败/不确定响应要按 token 查询，不得盲目换 token 重试。
- Q4A 没有修改 Browser `AttachmentRepository`、IndexedDB、localStorage namespace、Quote 编辑器或 Order attachment wiring。旧 Browser blob/ref 在 Q5 projection 中清零但源数据仍保护。

## Q4B isolated UI candidate（未部署/未切正式路由）

- 同一个 `QuoteAttachmentPanel` 通过高层 `QuoteAttachmentController` 复用现有图片/文件、粘贴/拖放、预览、下载、命名、移除与款式图 UI。默认 Browser controller 继续使用原 `indexedDbAttachmentRepository`、`saveQuoteAttachments` 和同一 localStorage/IndexedDB 语义；未改变正式 `/quote-center`、`/quote-center/new`、`/quote-center/detail` 或 SalesOrder 的附件 authority。
- 仅独立 `/quote-center/server-edit?id=...` 注入 Server controller/typed Q4A client，显式标记 `Source = PostgreSQL`、`Attachments = Server candidate`、`Production cutover = NOT ACTIVE`。请求使用同源 credentials、mutation boundary、expected Quote version 与每个 File 一次逻辑尝试的稳定 UUID `Idempotency-Key`，不提交 caller actor/attachment ID/hash/storage key。下载走 authenticated binary Blob/object URL，并在组件卸载/切图后 revoke。
- Server 每次成功命令读回该 Revision 的权威关系列表，按 Server 返回版本更新 writer 的 `expectedVersion` 与三个附件镜像；其它未保存 base/cost draft 和 dirty baseline 均保留。409、传输不确定或 503 不自动重试/回退 Browser，要求显式重新读取核对。多文件顺序上传并逐次链式推进版本；失败仅报告已确认完成数量及不确定状态，不宣称跨 PostgreSQL/Object Storage 的全批次 ACID 回滚。UI“删除”仅 unlink 关系，不物理删除 object。
- 历史 Revision 由 Q4A API 保持只读；当前 writer 仍只编辑 default Revision，不新增完整历史导航。继承的同一 attachment metadata 名称可由多个 Revision 共享；D-012 仅定义引用快照，未确认历史显示名是否必须冻结。为避免当前改名影响历史显示，Server candidate 暂时禁止对被历史 Revision 共享的附件重命名。正式产品规则仍 **USER DECISION REQUIRED**；Browser 现有 rename 行为未改。款式图只属于每个 Revision 的关系属性。
- Q4B 仅前端工程 candidate。真实 PostgreSQL 0008 未应用，真实 3001 未部署，正常 Server runtime 没有 production Object Storage adapter，附件 API 可按 Q4A 规则返回 503。Q5 historical Quote migration、正式 Quote writer cutover、附件 provider/security/GC 均仍需独立 Gate。

未来正式 Server cutover 应使用 Q4B 高层 controller 及受控部署，不把关系/版本命令硬塞进低层 Browser `AttachmentRepository`。

## Q4C-A S3-compatible adapter（工程实现；未生产激活）

- `server/attachments/s3-storage.ts` 基于 S3 SDK v3 实现 provider-neutral `AttachmentStorage`：PUT 按 MIME 设置 Content-Type，计算 lowercase SHA-256 并写入对象 metadata；HEAD 读取 ContentLength/sha256；GET 返回 Node stream；remove 仅为 interface/isolated test，runtime 不自动调用、无 GC。HEAD 404 会额外执行 HeadBucket 确认 bucket 存在，避免把错误 bucket 误判为缺对象；因此未来生产凭据需要允许此只读检查，否则会 fail closed。认证/网络/provider 故障以安全 storage failure fail closed，不转储 SDK 错误。
- `server/config.ts` 仅在 `ZHIXU_ATTACHMENT_STORAGE=s3` 时要求 `ZHIXU_ATTACHMENT_S3_ENDPOINT`、`_REGION`、`_BUCKET`、`_ACCESS_KEY_ID`、`_SECRET_ACCESS_KEY`；`ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE=true|false` 可按 provider 设置。生产 endpoint 必须 HTTPS，disposable MinIO 允许 HTTP。无配置时保持原 503，不默认启用内存 adapter；密钥不进入 build-info、日志、Browser 或 OperationLog。
- 对象键仍由 Q4A service 生成 `attachments/<attachment-uuid>/original`，不使用文件名、Quote 编号或本地绝对路径。Browser 仍通过织序 Server API 下载，不直接访问 bucket。隔离 MinIO + PostgreSQL 集成验证 PUT/HEAD/GET、大小/hash/MIME、错误凭据/bucket/网络 fail-closed 及 Service 上传→关系→下载；无真实 bucket、生产 provider、真实 0008、Ubuntu 部署或 Browser authority 切换。

## Future production architecture — USER CONFIRMED

### Q4C-B official Node preflight（工程/disposable only，2026-10-08）

USER CONFIRMED infrastructure（不是本代码 Gate 实测）：Tencent COS 私有 bucket `weaveops-prod-1501437430` 已建立，region `ap-hongkong`，endpoint `https://cos.ap-hongkong.myqcloud.com`，`forcePathStyle=false`；无 CDN、anonymous access、public read 或 static website。CAM 子账号 `weaveops-cos` 的凭据由用户安全保存。宁波 Ubuntu `weaveops-server` 的 Python SDK 1 MB PUT 已 PASS；不重复该测试、不接触原 `connection-test/*` 对象。直接复用 bucket，runtime `storage_container` 无特定命名依赖；早期 Q4A/C-A 的“provider 未选”是工程 Gate 历史状态。

`scripts/preflight-object-storage.ts` / `npm run preflight:object-storage` 与 Server runtime 共用纯 `storage-config.ts`；不读取 `.env` 文件、不调用 Server startup、DB 或 auth。配置仅来自 process environment：`ZHIXU_ATTACHMENT_STORAGE=s3`、`ZHIXU_ATTACHMENT_S3_ENDPOINT`、`_REGION`、`_BUCKET`、`_ACCESS_KEY_ID`、`_SECRET_ACCESS_KEY`、`_FORCE_PATH_STYLE`。CLI 缺省按 production 校验 HTTPS；disposable 测试显式使用 test。Endpoint credentials/query/hash、空凭据、非法 region/bucket/style 拒绝；错误不打印值。真实 secrets 仅在用户环境中安全注入，不写 Git、文档、CLI 参数或聊天。

Probe boundary 与正式 `attachments/<uuid>/original` 独立且不可由 caller 覆盖：每次 `crypto.randomUUID()` 生成唯一 `zhixu-preflight/<uuid>/probe`，64 KiB `randomBytes`，计算 lowercase SHA-256；依次 HeadBucket → PUT（exact length、octet-stream、sha256 metadata）→ HEAD 三项校验 → GET 完整 length/hash 校验 → 精确 DELETE → HEAD 404 + HeadBucket 证明 bucket 仍存在。所有阶段含 GET body 都有 10s timeout/AbortSignal，SDK 最多 2 attempts、使用同一 key。没有 LIST、multipart、public ACL、bucket administration 或 bulk delete。

PUT 可能成功后的失败也执行精确 key best-effort cleanup。删除/absence 不能证明时输出 `FAIL_CLEANUP_REQUIRED` 与安全 bucket/probeKey；不得宣称 PASS。退出码非 0；不会物理删除正式附件、任意已有对象或 prefix。原始 SDK error/request/header/body 不进入 stdout/stderr/evidence。

Evidence `zhixu-object-storage-preflight.v1` 包含安全 endpoint origin、region/bucket/style、key、bytes/hash、各 stage/cleanup flags、timings 和 UTC start/end。可选 `--evidence <absolute path>` 在 network 操作前 exclusive 新建文件，不覆盖已有证据；缺省只输出 stdout JSON，不默认写仓库。**它不证明 privateBucket、runtimeConfigReviewed，也不是 Q5 `quote-object-storage-readiness.v1` final proof。** 后续独立 activation Gate 要另核 private bucket、正式 runtime 配置与 evidence，再生成 Q5 proof。

最小 CAM 目标：bucket HeadBucket；`zhixu-preflight/*` PutObject/HeadObject/GetObject/DeleteObject；`attachments/*` PutObject/HeadObject/GetObject，DeleteObject **explicitly denied**。不要求 LIST/GetBucket listing、DeleteMultipleObjects、multipart、public ACL 或 bucket 管理，不为工具扩大权限。

未来用户 Ubuntu 独立运行（PR 合并后，secrets 仅安全注入环境）：

```sh
npm run preflight:object-storage -- --evidence /absolute/private-evidence/cos-preflight.json
```

本 Gate automated tests 仅 disposable MinIO/generated credentials，既有 adapter 回归仅 disposable PostgreSQL；不访问 Tencent COS。**Official Q4C-B real Tencent preflight NOT RUN，真实 0008 NOT EXECUTED，真实 PostgreSQL UNCHANGED，Quote migration NO，runtime deployment NO，Q5 Execute NOT AUTHORIZED，Quote/现有附件 authority BROWSER。** 运行时 S3 adapter 的逐操作公网 timeout 未在本 PR 改动，仍须后续 activation review；工具 PASS 不代表 runtime 生产激活或生产 ready。

### Confirmed production attachment boundary

以下是 Quote Production 的已确认目标与 migration 边界；其中 schema/API 的工程基础已由 Q4A 实现但未生产激活：

- 当前 Browser IndexedDB Quote attachment blobs 不作为 Server Quote migration source，现有 QuoteRevision attachment references 也不迁移为正式关系。新 Server attachments 在 Quote cutover 后从空的正式 attachment domain 开始。
- 旧 Browser blobs 和引用不是损坏或 disposable test data；migration development、production acceptance 与 rollback window 内均保持原状。删除需要后续独立 destructive-data authorization。
- Server attachment metadata 与 Quote/Revision business relationships 持久化在 PostgreSQL；图片/文件 binary content 持久化在 Object Storage。VPS local filesystem 和 PostgreSQL large binary 均不是 production source of truth。
- Metadata 所列 UUID、文件名、MIME、大小、hash、kind、provider/container/key、可信 actor/time 与 lifecycle 已在 Q4A schema 中实现；Object Storage provider、生产配置、大小/文件 type 产品政策仍未冻结。
- PostgreSQL 保存稳定 storage identity/key，而不是 server-specific absolute filesystem path。推荐 key 形态为 `attachments/<attachment-uuid>/original`，不使用易变化的业务名称组织 object identity。
- 同一 Object Storage 继续使用时，更换 VPS 应只需部署兼容应用、移动/恢复 PostgreSQL、重建配置与 secrets、验证并切换 DNS，不应再次搬迁 attachment blobs。
- Local filesystem / IndexedDB 可以继续作为 development adapter，不能据此宣称 production attachment architecture 已完成。

完整 Quote-first rollout、migration transformation 与 rollback 原则见 `QUOTE_PRODUCTION.md` 和 `DATA_LIFECYCLE.md`。

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
