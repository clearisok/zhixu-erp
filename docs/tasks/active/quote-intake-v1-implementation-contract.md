# Quote Intake V1 最终业务契约与实施任务

> 2026-10-10；BUSINESS CONTRACT CONFIRMATION / DOCUMENTATION ONLY。**QI-01–06 已确认；下列字段名、状态、权限键、端点与存储方案是可执行技术提案，NOT IMPLEMENTED**。本报告不启动 A/B/C 开发。规则入口：[BUSINESS_RULES](../../BUSINESS_RULES.md)、[D-101](../../DECISION_LOG.md)、[QUOTE_INTAKE](../../features/QUOTE_INTAKE.md)。

## 0. 恢复基线与证据

- 初始 GitHub API/fetch main `49a82c9f970e158ded589300b4aa04fc4c809038`（PR84已合并），独立docs worktree从此clean基线创建，branch `chore/quote-intake-v1-contract`。提交前main并发合并PR87，最新API/fetch一致 `7ed9204d552384730bf93c992b500c530d639c38`；保存文档checkpoint `d56a6d859a656f350ec9b06dfa8f31b6797bcaf7`后普通merge，人工整合AI_HANDOFF/CURRENT_STATE/DECISION_LOG/PROJECT_INDEX四处文档冲突，保留上游代码/SQL原样。最终PR相对最新main仅文档增量。
- PR87已合并：`a6a59a9e269d0635f61b6564b2aec66dede4a6d2`，0009 DeliveryPlan 与 D-100；工程更新已普通合并最新 main。PR88 OPEN/not mergeable：`a21a3703482af2fd44a993357243bfde2549858a`，候选构建源 `330aad7`，不是新 UI 修复后的候选。PR89 OPEN/mergeable：`f450e25c4cb5de28158500b732eab1ea63890dc8`，报价列表/保护图片修复，人工验收未完成。
- #89 若纳入部署范围，#88 旧镜像不含此修复，必须从最终获审源码重新构建、重新验证镜像身份及 migration 原始字节；本轮不构建/部署。#87 若同时纳入，另需 app/schema 配套 Activation/rollback Gate，不能沿用仅镜像替换计划。
- 已恢复此前只读《Quote Intake 与两步报价流程契约审查》的结论并核对实际代码；该报告先前是会话交付，仓库未找到独立同名文档。本文件是此次永久固化，不虚构旧文件。
- 实际代码：`server/app.ts` 仅接受 POST quotes 空对象；`quotes/draft.ts` neutral distribution/CNY/null 参数；`quotes/service.ts` 的可信创建、差异权限、普通 PUT；`quotes/repository.ts` 的 createGenerated/createInTransaction/CAS；`quotes/version-workflows.ts` 的现有完整性校验/克隆；`quote-masters/model.ts/service.ts` 的 active preset 和默认解析；`attachments/service.ts/storage.ts` 及 0008 非空 Quote owner FK；calculator 无 QuoteType 排除材料分支。
- 实际测试阅读：quote-numbering、quote-api、quote-version-workflows、quote-attachments integration。已有覆盖 Server 编号/中性草稿、精确小数、readonly/CAS/可信 actor、上传失败/审计失败；这些不是 Intake 或新类型切换测试。本轮未运行测试/迁移。
- 最新main已含D-100/0009（#87）；#89未新增D-10x。本次 D-101；不更改其他未合并分支。

### worktree 只读 baseline（可能继续变化）

| 路径 | Branch / HEAD | dirty |
| --- | --- | --- |
| D:/workspace/preparesystem | main / e3e8e743c6a983c293dbd16f526242cbd24aa392 | AGENTS.md |
| C:/Users/Administrator/.codex/worktrees/d099-quote-list-acceptance/zhixu-ainuoke-api | fix/d099-quote-list-acceptance / f450e25c4cb5de28158500b732eab1ea63890dc8 | thumbnail/loader/client、相关测试及新增 image policy/fixtures/memory harness；保留 |
| C:/Users/Administrator/.codex/worktrees/d099-win01-update-preparation/zhixu-ainuoke-api | chore/d099-win01-update-preparation / a21a3703482af2fd44a993357243bfde2549858a | clean |
| D:/workspace/zhixu-ainuoke-api | fix/quote-server-original-ui-convergence / 460a9c1ef29ef69c21a0d0e02162ffb23d0528d8 | clean |
| D:/workspace/zhixu-ainuoke-c | feat/ainuoke-source-validation / d3cce4702f405bfce56759aa92abf1091e4de770 | clean |
| D:/workspace/zhixu-order-b | feat/order-c43-delivery-plan / a6a59a9e269d0635f61b6564b2aec66dede4a6d2 | clean |
| D:/workspace/zhixu-pr84-integration | chore/d099-user-preview / 2b59244e714d94b3d38e0413953e99e2eed58d4a | clean |
| D:/workspace/zhixu-server-deploy | detached / f0c252b52b6a626037e8ba70cf51d0e976e45447 | clean |

以上只读，不代表占用这些分支开展新任务；A/B/C 未来应从届时最新 main 各建独立任务 worktree。#87/#89 改动 AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX/DECISION_LOG/QUOTE_CENTER，后续普通合并需逐块保留，不互相覆盖。本任务保留上游原部署/工程证据，最新状态提示区分#87合并与0009真实activation。

## 1. 已确认与既有规则的关系

QI-01–06 全文只在 BUSINESS_RULES 维护；D-101 补充 D-003/D-035/D-088/D-090/D-096 与共享确认 D-084/D-087。D-029 的品牌/业务员 Quick Create 保留，制作预设独立维护不照搬嵌套编辑。D-097/D-099 当前 POST 后 PUT 是过渡创建流程，新 UI 以后替代但旧 POST{} 兼容。D-057 不给 Quote 强加订单默认币种。

已确认：手机连续收集→独立收集箱→电脑两步；加工隐藏材料保留数据/公式；明确类型切换/确认后新 Revision；本人范围/显式授权；一次转换/冻结保留；成衣日期映射；无预设正式草稿。未确认：具体权限键/字段长度/图片上限/HEIC/EXIF/离线同步/配置字段名称。技术提案变动不得弱化已确认语义。

## 2. 字段级模型（技术提案）

所有 DTO strict allowlist；未知 actor/ID/time/version/quoteCode 字段拒绝。数量和参数 Decimal 用 canonical string，不能经过 JS number；precision 超出 UI 无损表示则 fail closed，保留原值。

| Intake 字段 | 类型/约束建议 | 权威/语义 |
| --- | --- | --- |
| id | UUID PK | Server；稳定，非报价编号 |
| creatorUserId | BIGINT FK app_users，DTO public user UUID | session；不可改，ON DELETE RESTRICT |
| createdAt/updatedAt | TIMESTAMPTZ / ISO instant | Server clock；不作为交期 |
| version | positive bigint/integer，DTO safe integer 上限校验 | 每次业务 mutation CAS+1；客户端只交 expectedVersion |
| styleNo | string，建议 100 字符，允许空的收集草稿 | 客户端；不 unique，不自动合并 |
| styleName | string/null，建议 200 字符 | 可选，不以 null 伪装正式完成 |
| quantity | NUMERIC/null，非负 decimal string，建议最大128字符输入 | null 未知，0 明确零；不以 truthy 判断 |
| garmentLeadDate | DATE/null，DTO YYYY-MM-DD | 客户端合法日历日，不用 Date UTC 转换 |
| note | string，建议5000字符 | 客户端；日志避免全文敏感内容 |
| state | collecting/ready/converted/archived | 状态名提案；converted 仅由事务生成 |
| image collection | 独立关系表 intakeId/imageId/position/isPrimary | position 非负且 owner 内 unique；最多一主图；无图可 null |
| conversion | null 或 {quoteId,revisionId,priceVersionId,sourceVersion,convertedAt,convertedBy} | Server唯一结果；不泄漏 Quote 成本 |

`intake_images`：UUID、intake FK、createdBy/session、createdAt、originalName（清理路径字符）、mimeType、byteSize、sha256、provider/container/key（不返回普通客户端）、uploadToken、uploadState(pending_upload/available/pending_cleanup)。同 intake+creator+uploadToken 唯一；关系约束图片必须属于此 Intake、已 available。每次顺序/主图/上传落库推进 Intake version；转换冻结后拒绝上传/重新关联。

`intake_conversions`：intake_id PK/UNIQUE、quote_id FK UNIQUE（V1一对一提案）、初始 Revision/PV exact scoped FK、source_version、source_snapshot JSON（原字段及图片 ID/order/primary/SHA）、final_input_snapshot（用户最终完善值，与源值分开）、converter、createdAt。Quote 后续变更不改源快照。Quote id 沿用当前 TEXT 技术格式，不能盲改为 UUID列。

`creation_receipts`：server id、actor、clientRequestId(UUID)、commandKind、canonicalPayloadHash、state(pending/committed/rejected)、result IDs、sanitized error code、timestamps；UNIQUE(actor,commandKind,clientRequestId)。不设自动过期导致重建；归档/删除策略以后单独批准。另 `creation_staging_manifest` 绑定 receipt/sourceVersion/image IDs→目标 object/attachment UUID、SHA/size/status；所有路径 Server生成，防跨 owner。

### 权限矩阵（键名提案；不自动赋权）

| 动作 | 本人 Intake | 他人 Intake | 额外门槛 |
| --- | --- | --- | --- |
| 建立收集条目 | intake.create | 创建人不可指定为他人 | session/Origin |
| 列表/详情/原图/上传结果 | intake.read | intake.read + intake.read_all | creator filter 服务端；返回域一致 |
| 编辑/上传/顺序/主图/归档 | intake.edit + intake.read | 上述 + intake.edit_all + intake.read_all | CAS，converted拒绝 |
| 转换 | intake.convert + intake.read | 上述 + intake.convert_all + intake.read_all | quote.create；所请求正式设置/成本动作沿用原细粒度权限 |
| 读转换最小结果/receipt | 原命令 actor 或获授 Intake范围 | 同显式范围，非任意 requestId访问 | 每次 session/权限复核；不返回完整Quote |
| 进入正式编辑器 | quote.view | quote.view | 保存另需 quote.edit，成本/settings按现有键 |
| 全局制作预设维护 | 无自动授权 | 无自动授权 | settings.global.edit |

客户端 creator filter 不能扩大范围。无权对象统一404避免枚举；无功能权限403；失效session401。已有权限目录没有 Intake键，B负责审核后 additive catalog/migration，不按admin名称跳过。跨设备相同 session用户可读本人保存资料；离线与自动同步不在V1已确认范围。

## 3. 共同两步 UI 与配置状态

第一页 input `{quoteType:processing|distribution, manufacturingCountry:string|null, presetId:string|null}`。国家不是已存在的独立 Country master；展示来源需明确，允许“待设置”，不能猜中国或首个国家。有多个active preset必须主动选；仅一个也不能把自动选项当已确认方案。第一页返回本地 wizard state/只读 preview，不写 Quote。

第二页显示 snapshot 参数/来源/缺失项，完善 brandId、salespersonId、styleNo、styleName、quantity、garmentLeadDate、note。品牌/业务员沿用 Quick Create 权限；制作预设在独立设置页，返回恢复 wizard 内存草稿并提供主动重载/差异确认，不静默覆盖参数或基础资料。最终成功采用原 Quote Service 返回record/ID/version，进入原 Editor；不重做 writer。

普通新建仅wizard资料；Intake转换以已授权源版本预填，保留源/最终值差异，冻结在最终提交成功后。取消/返回不生成正式报价编号。部分填写可保留内存草稿；若要跨设备暂存，显式“保存到收集箱”走Intake权限/API而不是创建正式Quote；wizard持久化/自动保存属于后续技术选择，不默认塞入旧Browser业务namespace。

### 无预设参数待完善表示（技术提案）

建议在新 PV `pricingParameters.configuration` 增加 additive metadata：`{schemaVersion:1, status:incomplete|configured, sources:{manufacturingCountry,laborCurrency,usdCnyRate,markupRate,freight}}`，每项值 `unset|technical_default|explicit|preset|accepted_default`。由Server根据受审输入计算，不信客户端status。字段名称需B Gate确认。

- laborCurrency保留现有非空 CNY 技术默认，但 source=technical_default、status=incomplete；country为空/preset=null/rate及markup/freightAmount=null，不能制造可用方案。includeFreight=false技术结构默认同样不等于用户明确“不含运费”。
- 明确币种可标explicit；选中且确认active preset所给字段标preset，确认真实既有defaults才标accepted_default。不猜缺失预设中的汇率，也不因有preset就自动configured。
- 配置完成建议：country与currency有业务来源、markup明确（0合法）、运费策略明确（不含则无需金额；含则name/amount明确）、USD需明确汇率；CNY不强求USD率。无预设可手工完成。该判定只用于状态/提示，不能重新定义公式或客户确认/Excel校验。
- 旧PV缺字段作为 `legacy_unspecified` 读取状态，不从CNY推断已选择，不批量回填/重算/改变确认与导出；旧POST{}保持响应契约，不强制新字段。旧数据编辑时仅明确配置动作添加metadata，generic保存不能静默“认证”技术默认。
- 待完善草稿可最终创建，不能冒称可对外完整报价。原有 validateQuoteCreation（brand/person/style/name/quantity）与 neutral draft不同；新wizard建议允许缺资料的draft并返回missingFields，仍保留原业务节点完整校验。是否放宽某业务节点必须单独审阅；隐藏材料不豁免现有完整性校验，提供授权的“查看待完善内部成本”入口定位错误。

## 4. API 提案（所有新端点 NOT IMPLEMENTED）

所有mutation复用可信session、Origin + X-Zhixu-Request:1、strict DTO、bounded body。不接受quoteCode/createdBy/ID/actor；requestId仅客户端幂等token，Server correlationId另生成。

| Endpoint | 请求 | 响应与版本 |
| --- | --- | --- |
| POST /api/v1/quote-intakes | `{clientRequestId, fields:{styleNo,styleName,quantity,garmentLeadDate,note}}` | 201 `{intake,receiptId}`；同token同payload返回原结果，无虚构Quote |
| GET /api/v1/quote-intakes | scope=own/team显式权限、limit/cursor、state；有界分页 | `{items,total,nextCursor}`，最小资料/图metadata，无成本 |
| GET /api/v1/quote-intakes/:id | 无body | `{intake}`，含version/authorized images/conversion最小引用 |
| PATCH /api/v1/quote-intakes/:id | `{clientRequestId,expectedVersion,patch:{允许字段/state}}` | 200 `{intake}`；不支持客户端converted/creator覆盖 |
| POST /api/v1/quote-intakes/:id/images | multipart：uploadToken、expectedVersion、file | 201 `{image,intakeVersion}`；MIME/signature/size/SHA验证；同token结果查询恢复 |
| GET /api/v1/quote-intakes/:id/images/uploads/:token | 无body | `{state,image?,intakeVersion?,errorCode?}`；不暴露storagekey |
| PATCH /api/v1/quote-intakes/:id/images | `{clientRequestId,expectedVersion,imageIdsInOrder,primaryImageId:null|id}` | 200 `{intake}`；集合/主图/owner约束 |
| GET /api/v1/quote-intakes/:id/images/:imageId/download | 无body | 受保护binary；权限/owner/available/integrity重验 |
| POST /api/v1/quotes/creation-preview | 下方preview input | 200 `{previewId,fields,pricingParameters,configuration,missingFields,warnings,reviewedVersions}`，不创建Quote |
| POST /api/v1/quotes/creation-workflows | 下方final command | 201 `{receiptId,result:{quoteId,revisionId,priceVersionId,version},quote?:authorizedProjection}`；重放200同结果 |
| GET /api/v1/quotes/creation-receipts/:clientRequestId | actor绑定查询 | `{state:pending|committed|rejected,result?,errorCode?,retryable}`；revalidate权限，完整quote另GET |

PATCH允许fields及 collecting/ready/archived转换，converted永不可客户端指定或重新打开；converted拒绝字段/图片mutation，归档已转换记录若以后需要只改独立可见性元数据而不改冻结源。ready不以成本完整性为前提。styleName空串规范为null，styleNo去首尾空格但保留业务原值不做跨条目dedup。

Intake create/patch也需要receipt恢复，可统一`GET /api/v1/quote-intake-receipts/:clientRequestId`，action/actor绑定避免跨操作碰撞。上传incomplete可只查状态，安全显式重传同token；不以失败为自动删除授权。

Preview input：`{source:null|{intakeId,expectedVersion}, quoteType, selection:{country:null|string,presetId:null|UUID}, fields:{brandId:null|id,salespersonId:null|id,styleNo,styleName:null|string,quantity:null|decimal,garmentLeadDate:null|date,note}, parameterOverrides:{可编辑参数值}}`。`parameterOverrides` strict允许 `laborCurrency:null|CNY|USD`、`usdCnyRate:null|非负decimal string`、`markupRate:null|非负decimal string`、`includeFreight:null|boolean`、`freightName:null|string`、`freightAmount:null|非负decimal string`；字段缺失表示沿用已审核选择，null表示待完善，不混用false/0。country仅selection.country，preset名称/ID及source/status不能override；Server从active preset读取并生成snapshot。Null includeFreight在新DTO保留待配置语义，转旧结构false时configuration必须标unset。参数override不是随意客户端快照：quote.settings.edit等原权限；来源/default应用保护沿用现有规则。Preview权限至少quote.create；Intake source需对应scope/convert；不因无quote.view就泄漏master完整成本，使用权限过滤的创建选项projection，不能直接放宽既有master GET。

Preview响应 reviewedVersions：`{intakeVersion:null|n,brandVersion:null|n,salespersonVersion:null|n,presetVersion:null|n,globalSettingsVersion:null|n}`及有变更影响的默认资料版本。previewId是Server签发、绑定actor+payloadhash+versions+有效期的review token，不能把它当永久存储或idempotency receipt；过期需重新确认，草稿保留。无某记录使用null，不拿0伪装未配置。preview使用一致读；当前resolveDefaults多查询需B扩展同一事务/版本读能力。

Final command：`{clientRequestId,previewId,source,quoteType,selection,fields,parameterOverrides,imageSelection:null|{sourceImageIdsInOrder,primarySourceImageId}}`。普通新建imageSelection=null，创建后沿用正式附件上传；若以后支持普通新建预上传，应复用相同staging而非伪造Intake。Intake转换默认全部源图，改变选图须明确用户操作且原图全部保留；最终mapping写receipt。最终数据hash必须与preview一致；不接受整单ServerQuote。

### 错误和网络恢复

| 分类 | 行为 |
| --- | --- |
| 400 invalid_* | 非法日期/decimal/字段/选择；无业务写入，保留草稿 |
| 401/403/404 | 失效session/撤权/无对象scope；停止，禁止Browser fallback；重新登录不清本地输入 |
| 409 stale_intake/stale_quote/stale_parameters | 展示已存版本及差异；显式重载/重新preview确认，不自动overwrite |
| 409 intake_already_converted | 返回授权最小既有结果；不能二次Quote |
| 409 idempotency_payload_mismatch | 同token不同canonical payload拒绝；显式新操作生成新token，但不能绕过Intakeunique |
| 409 creation_pending / preview_expired | pending查receipt；过期重新review但未知提交先查原receipt |
| 413/415 | 尺寸/MIME/signature失败，图片/字段仍留当前卡，不能假保存并清空 |
| 5xx/storage_incomplete/network timeout | outcome未知先查同receipt；committed打开原Quote；pending等待/显式恢复；rejected显示失败后再重审。相同token恢复，不重新POST{} |

未授权receipt不能泄漏存在性/结果或扩大Quote可见范围；权限撤销时停止后台重试/图下载，撤销不抹掉已提交转换事实。网络失败后save&next仅在查证成功时进入下一款。

### 旧 POST{} 兼容

旧 `POST /api/v1/quotes {}` 保持201 `{quote:<原record>}`、中性draft及已有权限/Server编号/审计，不接受新fields，不强制幂等header。新增workflow是同可信Service能力扩展，不改旧请求合法性。新两步流程禁止调用旧POST后再PUT拼接最终创建；最终单事务完成quote与来源/结果。旧客户端可能仍走旧行为，其type PUT同时受新switch guard，首次未确认选择需明确允许兼容路径。

## 5. 图片 staging、原子创建及恢复顺序

1. session/scope/输入和receipt查验；同token hash冲突拒绝、已committed直接受权重放。短事务登记pending receipt/lease，避免并发worker重复执行；尚未分配正式quoteCode。
2. 获取授权source快照/版本，要求所有选图available，记录manifest；源Intake此时可继续编辑，最终CAS会阻止旧source提交。
3. 通过AttachmentStorage.get读取授权原图，验证size/SHA/signature；对每图新Server UUID/key执行put/head校验，保留源原图。目标attachment UUID与未来Quote UUID可提前作为staging identity，**不写正式Quote或编号**。失败记录staging状态，普通业务不调用remove。
4. 最终一个PostgreSQL事务：锁receipt→Intake root（如有）→受审master版本（按固定ID顺序）→已有Quote root/CCT（仅type switch）；复核当前session授权、receipt/唯一转换、IntakeCAS、master active/version和payload；一致读权限撤销需定义与auth更新的序列化点，不能只在请求开头查旧permission cache。
5. 调用**原可信Quote Service**的transaction-scoped创建能力，复用allocator/createServerQuoteDraft/原repository写入；不在外层调用自行BEGIN/COMMIT的createRuntimeDraft形成假嵌套事务。Repository复用createInTransaction，仅扩展内部组合能力，不暴露任意aggregate公共writer。
6. 同事务写正式Quote/初始Revision/PV、已验证Quote附件metadata/关系、源→目标image mapping、conversion原始/最终snapshot，CAS冻结Intake，提交唯一result/receipt及可信OperationLog。一次Quote业务create事件及一次Intake转换事件，attachment事件遵循现有审计，不重复日志；审计失败全部DB rollback。
7. COMMIT成功才返回正式结果；COMMIT响应丢失查receipt/uniqueconversion。rollback后对象可存在，但没有正式Quote/关系/converted；保留manifest证据，显式retry复用校验对象。唯一性保证同Intake不同token并发最多一Quote，其余返回existing结果；不把sequence gap当数据损坏。

对象存储不可参与DB原子事务；staging中途崩溃、租约过期/worker接管、DB成功但响应丢失分别有恢复测试。无pending对象自动GC；仅未来审批的保留策略可清理确认未引用对象。日志记录IDs/version/hash/errorCode，禁止原图bytes/base64/凭据及敏感备注全文。源图下载对creator及显式scope开放；Quote图走现有Quote权限，不能借转换映射跨域绕权。

## 6. 类型切换服务契约（B 拥有；NOT IMPLEMENTED）

建议专用 `POST /api/v1/quotes/:id/type-workflows`：`{clientRequestId,expectedVersion,sourceRevisionId,targetType,mode:current|new_revision,acknowledged:true,reason,note,expectedTermsVersions:[{termsId,version}]}`；response沿用record/receipt。targetType整Revision，不能PV级；no-op不能重复Revision/日志。

未确认当前可写Revision：quote.edit+明确确认，保留所有cost/params/IDs/confirmation不动，CAS与audit。确认保护既看任一PV local snapshot，也按exact quoteId/revisionId/pvId查linked CCT当前；linked不可用/provenance不完整必须fail closed，不猜未确认。保守实施提案把已有任意历史确认也纳入new_revision保护；B Gate须明确其范围，不得将当前/linked确认漏判为未确认。

已确认：quote.revision.update+quote.edit，沿现有完整性校验/命名/clone规则创建新Revision后切type，旧历史保持readonly；清除的只是新PV确认，保留旧snapshot与所有CCT/SalesOrder links/current值。不能把新Revision自动重新链接旧CCT、清空/覆盖共享terms，不能删除association。source必须明确所选完整snapshot，不以“重新新建Quote”绕过。

genericPUT：任何已有Revision type变化都调用同保护检查；确认后/历史Revision拒绝409 type_switch_requires_revision。未确认也要求可信明确type命令（旧首次draft设置兼容需受审标志/路径而非任意body布尔授权）；新revision通过旧genericPUT伪造类型/IDs同样需拒绝，不能只拦existing ID。terms确认与type切换的锁顺序、CAS一致，竞争须有可控测试。

当前version-workflows只按localconfirmation计算basedOnConfirmedRevisionId；linked-only场景的confirmed provenance与新Revision规则需补齐并覆盖，不能伪称已经处理。切回distribution只恢复显示，既有明细不清理、不自动apply preset。可无preset，主动应用时沿原PV快照/运费行处理和细粒度权限。

## 7. Migration 与实施验证计划

最新main已含0001–0009（#87刚合并）。B开始前再次核对最新main/open PR与编号owner，**本轮不预留、不创建0010**；若届时仍无人占用，下一个可分配0010。#87工程合并不是0009真实activation，Intake release需明确app/schema配套Gate；不冒用0009或跳号造成运行/ledger不兼容。不能修改0001–0009原始字节/checksum；新增独立forward-only迁移，不backfill伪Intake或Quote。未来对象manifest/receipt/配置metadata是否拆migration由B决定并记录。

以下是未来计划，**本轮全部 NOT RUN**；只用disposable PG与MemoryAttachmentStorage/合成图，不能连18443/18444 DB或真实COS。

| 场景 | 必须断言 |
| --- | --- |
| 非空库向前迁移 | 原Quote/历史/PV/附件/订单/CCT/log/ledger逐项保持，新表空；不变旧SQL字节 |
| 单Intake并发转换 | 相同token同payload、不同token、多worker受控交错均最多一Quote/唯一result，audit不重复 |
| CAS/来源漂移 | 编辑/上传/排序与转换竞争→409；source snapshot与最终sourceVersion精确一致 |
| null/zero/精度/日期 | null和0/0.000…不混淆，大Decimal精确；闰日/非法日/时区矩阵不偏移 |
| session/RBAC/撤权 | 伪actor/role拒绝、own/all交叉、receipt/download范围一致；preview后撤权/停用用户不提交 |
| 原子回滚 | Quote写入/关联/sourcefreeze/receipt/audit任一步失败DB全部rollback，无converted孤儿；编号gap允许 |
| 图片失败恢复 | put/head/get/SHA错误/DB提交失败/响应丢失/进程崩溃/lease接管；原图不变，无remove，staging可查 |
| 预设漂移 | preview后停用/版本变化/品牌业务员变动→409主动review；返回settings保留用户输入 |
| 配置状态 | 无preset允许draft、technical CNY非configured；明确0/false有效，旧PV缺metadata不被重算 |
| 类型切换 | 未确认明确switch；local/linked确认后新Revision；genericPUT伪造/历史/新revision绕过拒绝 |
| confirmation竞争 | terms-first/type-first锁顺序，CAS/audit一致；CCT/SalesOrder provenance前后完全保留 |
| 旧接口与回归 | POST{}原响应/neutraldraft；Quote/Estimate/附件/export/list/Source/Order流程不变 |
| 手机与连续录入 | 文件选择/相机取消、多图排序主图、网络失败保留、双击save&next同token、查证成功才清当前卡 |
| 两步桌面 | 返回/取消无Quote；普通/Intake共流程；受限权限提示；新建成功原EditorID/version正确 |

业务节点仍用原完整性验证；如隐藏材料阻止确认，显示授权错误定位，不能靠删除材料/更换公式让测试通过。自动化工程PASS不等于用户验收PASS。

## 8. 独立实施任务与依赖

启动顺序：用户审查本契约 → B Gate0 migration/DTO/权限/原子命令设计审核 → A/C采用同DTO；A可先做不写业务的交互原型 → B完成可信API/类型保护/附件 → A接最终创建 → C接收集与同wizard → D审查/隔离Preview/业务验收。每阶段从届时最新main独立worktree，记录branch/fullHEAD/dirty baseline；可验证Gate只stage自己增量，checkpoint commit/push/AI_HANDOFF，唯一PR，不自动merge。共享入口app.ts/权限目录/文档由owner提交，其他人提契约变更不直接改。

### Codex A — 两步报价 UI

- 前置：当前#89及其后续dirty修复先明确交付边界；本契约获审；B批准creation/type DTO。API未完成可用合成fixture测试交互，最终创建禁用且显示待接通，不能假成功。
- 所有权：`features/quote-center/components/production-quote-pages.tsx`、新`quote-creation-wizard.tsx`/参数展示；`quote-editor.tsx`、`quote-pricing-settings.tsx`中条件显示与明确type操作；`features/quote-center/server/quote-creation-client.ts`；对应UI/client测试。正式route仅必要接线，不盲用历史server-new页面。普通与Intake使用同wizard。
- 禁止：server writer/SQL/allocator/成本计算公式/Quote repository/附件storage与Source；不修改C收集箱，保留既有材料/工价/确认，不覆盖#89列表修复。
- Gate A0 baseline/原型与DTO → A1两步/独立preset入口/返回保护checkpoint → A2真实API幂等恢复/processing详情/type guard反馈checkpoint → A3隔离UI回归/交付PR。每Gate更新自己任务证据/接力，实际API接线未完成不得宣称业务PASS。
- 自动测试：取消/back零创建、多preset/no preset、技术默认提示、settings回程不覆盖、双击/409/未知网络receipt、普通/Intake统一、材料IDs值不变、确认后revision/type、旧PV/权限/精度/export UI回归；使用原calc。
- 用户验收：两种类型分别走两页；无preset草稿；主动配置返回；加工工价/说明与内部含材料金额标签；明确切经销原明细恢复；确认后新Revision旧history不变。
- PR标准：真实B API隔离验收、typecheck/lint/npm test/build及合成浏览器证据；明确尚未实现/用户验收，代码owner文件最小范围。

### Codex B — Intake Server 与创建事务

- 前置：#87 migration顺序/发布兼容明确；latestmain baseline；DTO/参数status/permissionkeys/附件manifest设计先审。不开真实activation。
- 所有权：新`server/quote-intakes/{model,repository,service,routes}.ts`；`server/quotes/{service,repository,draft,version-workflows,model}.ts`必要组合与type guard，新`creation-workflows.ts`/receipt；`server/app.ts`路由唯一owner；`server/attachments/`抽取复用验证/manifest；`server/quote-masters/`一致版本读取；权限catalog/session相关只additive；届时获分配migration；server integration tests。共享model配置metadata由B先定DTO，A/C不并改。
- 禁止：Quote UI、A列表改动、calculator复制/改公式、旧SQL字节、运行配置/COS/真实DB/容器、Browser storage schema。
- Gate B0依赖/DTO/RBAC/TX设计checkpoint → B1 schema/own scope/CAS/可信审计与非空迁移tests → B2 Intakeimages/staging/restore → B3共同creation/receipt/uniqueconversion/旧POST兼容 → B4type guard与linked CCT竞争 → B5全矩阵回归/PR。每Gate独立commit/push/接力，禁止提交未知dirty。
- 自动测试：第7节Server矩阵全部在disposablePG/mockstorage执行；不能把Docker不可用写成通过。必要typecheck/lint/npmtest/server/frontendbuild，保留旧API/Source/Order/报价测试。
- 用户验收支持：提供合成API脚本/数据，演示一次转换/同token恢复、源freeze、两类确认type路径、原图与Quote图映射；脚本不能默认连接持久库。
- PR标准：数据库唯一约束证据、可控并发/撤权/审计rollback/图片恢复；server DTO可供A/C消费；migration编号/activation限制明示，不把合并当真实migration授权。

### Codex C — 手机速录与电脑收集箱

- 前置：B审核DTO/API/权限/上传恢复；A已确定共同wizard入口；没有API时只原型，不生产mockRepository。
- 所有权：新`features/quote-intake/{model,server,components}/`客户端DTO引用/页面/图片卡；`app/quote-intake/`速录与箱路由；导航最小接线（与A协调，单owner）；对应客户端/UI测试。转Quote入口调用A的wizard，不自写Quotecreate。
- 禁止：server Repository/API/SQL/RBAC策略、Quote writer/calculator/Browser namespace、A wizard内部并改、真实图片/凭据/离线后台队列未审先做。
- Gate C0恢复DTO/手机交互 → C1拍照/逐款字段/失败保留/同token恢复checkpoint → C2电脑own/team权限箱、编辑、图片排序主图/共wizard接入checkpoint → C3真实隔离API跨设备与手机验收/PR。
- 自动测试：camera/file input取消、unsupported MIME明确反馈、上传部分失败不丢字段、CAS编辑冲突、双击save&next、conversion未知结果、restricted图片无请求/Blob清理、本人/团队scope、convertedreadonly与原图保留；跨session数据来自Server，无Browserfallback。
- 用户验收：手机连收3款（含null/0/有交期/多图）；断网后原卡保留；恢复查结果后下一款；电脑同人查看完善；无授权其他用户不可见；转入A两步仅一Quote且返回来源。
- PR标准：真实API合成端到端、typecheck/lint/npmtest/build、手机实际camera/HTTPS若未跑需标NOT RUN；不能把桌面文件选择等同真机拍照PASS。

### Codex D — 独立集成与验收（下一轮另行启动）

- 前置：用户启动授权、A/B/C完整交付、DTO一致且无未知dirty；从最新main建独立集成worktree，先只读审各PR/fullSHA。
- 所有权：集成冲突、恢复文档/证据、隔离Preview方案；不能替各owner补业务规则而不复审。现有18444数据/账号/网络/volume保护，更新Preview需届时独立授权，不能用本次docs授权。
- Gate D0审API/migration/公式/权限/历史/附件 → D1普通merge冲突与最小回归checkpoint → D2获授权隔离候选与exactimage/migrationbytes核对 → D3四条业务卡/手机-电脑验收 → D4用户明确接受后提出合并建议。不得自动merge/真实activation/部署。
- 自动/人工：聚合第7节、真实返回IDs与scope、历史snapshot/CCT完整性；工程/候选/Preview/人工验收各记状态。不因自动测试通过代用户签业务验收。
- PR标准：各owner提交/来源SHA/合并delta清楚，测试实际新跑，remainingdirty/未验收列明；真实更新需后续明确授权。

## 9. 待技术落实与业务复核点

- B确认配置metadata持久化/legacy读取、draft缺资料最低门槛、权限键/授予流程、preview有效期、receipt租约/保留、权限撤销序列化；这些是提案不冒称用户字段选择。
- 对“任一价格版本已确认”需涵盖linked-only及历史确认，默认保守不绕过；新Revision完整性和basedOnConfirmedRevisionId精确一致，不能清共享current。旧首次processing PUT的兼容路径须有可信可审设计。
- 图片限额/HEIC支持/EXIF/离线同步尚未获产品决定，V1不默认实现；copy-on-convert需成本/带宽与恢复设计评审，但保留源图不变是已确认规则。
- #87本轮已普通整合，后续#89文档合并仍要保留D-100/D-101及双方证据；#88候选需按最终纳入代码重新准备。所有migration编号仅B启动时分配。

## 10. 本轮交付边界

仅修改文档；未修改生产代码、SQL、测试、AGENTS；未执行真实或隔离migration/测试/容器操作，未读凭据/真实业务图、未访问18443/18444运行态或COS，未部署/merge，未启动A/B/C。验证仅docs diff-check、链接/字段/owner/编号一致性、代码事实只读核对。提交和远端PR证据由最终交付报告给出，Git commit不在自身文档中伪填。
