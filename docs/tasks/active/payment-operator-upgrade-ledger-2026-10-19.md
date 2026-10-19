# 财务操作升级测试的分支清单兼容

同日最终交付补充：用户新授权的119/f004c1eb1b03dac22ffbd402eb320d1a33d51a3d仅上传一次，独立证明后117/1b08ea9348ecf377c1b4e4cdea4ba5d574a2250a、118/d5773dd4abe50289efc4b527d481643e4b8a9c64以force=false快进，三个新完整提交各三项Hosted CI全部SUCCESS。旧下文“尚未上传/待答复”属于各本地阶段原记录，当前回执见[最终交付的同名章节](price-coordination-final-delivery-2026-10-19.md#测试兼容修复精确交付)。原失败与原始提交均保留，未合并部署或修改真实数据。

2026-10-19；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。指定交付119/1ab0d8c0598a4cf270bf2618ece260bcbcbf20f5及117/92623fe652fa9c650bb185a2494907e5d63e03d1、118/e7c8bafdb732827bbcde340bf6f7a3ba3281e071已独立核实。119新三CI SUCCESS，110原三绿；117/118各baseline/team-access SUCCESS，source失败。

## 已确认原因

source run39182637068、39182641231分别在ainuoke-payment-operator.integration.test.ts:275失败。旧断言只列0026/0027，当前Source正确新增0028，G3还新增0029。加工整合测试已列到0030，故本机37命令和新Hosted119均通过；这不能证明上游分支同一测试已通过。两个失败前均通过261完整PG与本轮安全引用检查，后续步骤被跳过。日志保留于outputs/price-coordination-delivery/final-compat-pr{117,118}-source-failure-*.log，不重跑旧失败SHA掩盖。

## 最小修复与安全边界

升级部分只修改测试的import与清单断言，复用同目录已有migrationFilesAfter(25)。该函数读取人工维护、明确排序的CURRENT_MIGRATION_FILES，不发现生产migration目录或调用runner生成期望，仍逐文件、逐顺序严格比较。旧行inventory哈希、操作命令表为空、二次迁移零应用、旧schema回退拒绝、CLI洁净提交要求及秘密不反射等断言全部保留。另同步加工来源只读Modal断言，见下文；没有产品代码、SQL、UI、金额/权限或来源范围变化。

不修改真实账号、现有业务数据库、旧演示、Source读取/绑定/激活、调度、宁波或18443/18444；只使用既有合成fixture、一次性空PG和私有临时文件。不自动追加推送、合并或部署；本轮指定一次119上传已消费。

## Source阶段

从clean feat/order-business-source / 92623fe652fa9c650bb185a2494907e5d63e03d1开始。交付复审的本地文档分支chore/price-coordination-delivery-review-2026-10-19已在10e39c8600570b63d27974a236032574f5e4c970独立提交并通过精确main守卫、94基线；它没有上传，也未引入Source分支代码。

本阶段两个测试行修改后，类型、目标lint、Node编译及21项操作测试通过（工作树dirty，实际CLI子进程正确拒绝dirty，未冒称洁净提交的durable readback）。先保存独立checkpoint，再在clean状态重跑21项以验证实际读回。Source和G3需各自核实尚未到达的工作流尾部，不能只依靠119结果。日志前缀outputs/price-coordination-delivery/source-ledger-*。

Source checkpoint bf0cca656f1cb5c21b6ddda7a65f383a3eaf3f8a在clean状态重跑21项通过，实际CLI durable readback通过；随后selected-source13、fresh7、数量/隔离边界33、拥有权/窗口21全部通过。94发布基线与精确守卫通过（11/45/58），显式Server构建bf0cca65完成；没有启动或替换既有演示。

独立补跑Source浏览器尾部，continuous13通过，但processing-batches旧测试仍等待D144“当前业务来源/来自报价”，实际已是D145“采用报价”只读Modal。这是此前119加工阶段已改文案、尚未同步上游的另一个旧测试遗漏。仅把该测试改为检查采用报价、精确报价编号、确认工价和无任何input/select/textarea，保留无认领及全部消费防重/回执/分页检查；不移入119新增加工推送流程或删除上游参考批次场景。初次失败日志保留，修正后该文件和后续各UI套件正在单独执行，不称首次整批通过。

Source最终各套通过：continuous13、修正后processing-batches9、business-source7、material-history9、material-display10、payment-panel9，合计57个实际Chromium场景；初次失败保留，不重复累计重跑。构建实际业务源码bf0cca65与92623fe6产品目录相同，最后只改测试/文档；没有重新生成截图哈希或改生产控件。Python131项通过，运行时为已有bundled Python且关闭bytecode。五条后端尾部命令合计95项、94基线、类型/两个修改测试lint/MJS语法及Node编译均通过。只把已执行的尾部称本地通过；上游新Hosted source仍为FAILURE，须新范围交付后重新核实。

日志与结果：source-ledger-tail-backend-results-2026-10-19.json五条exitCode为0；source-ledger-tail-ui-results-2026-10-19.json保留初次失败，source-ledger-tail-ui-fixed-results-2026-10-19.json五条为0，continuous13原通过另保留；source-ledger-{baseline,checkpoint-guard,typecheck,lint,processing-ui-lint}-2026-10-19.log及tail-python均本机忽略文件。最终commit精确守卫在Source最后checkpoint后单独核对。

## G3前向整合

Source最终1b08ea9348ecf377c1b4e4cdea4ba5d574a2250a的精确守卫PASS（11/45/58）。G3从clean e7c8bafdb732827bbcde340bf6f7a3ba3281e071前向合入，只有共享摘要两文件冲突，整合者协调并逐字保留G3原文到completed/2026-10-19-before-negotiation-ledger-{handoff,current-state}.md。没有改G3业务代码或引入119加工后续能力，实际测试/构建结果在独立执行后补录。

G3 checkpoint7669dd1465abb63a05b091486604fec3bb623bab已在clean状态通过操作21（实际CLI durable readback）、selected13、fresh7、数量/隔离33、拥有权/窗口21，五命令95项。该精确G3源码Server构建上七套Chromium均通过：continuous13、processing-batches9、business-source7、sale-adjustments5、material-history9、material-display10、payment-panel9，共62；没有使用Source或119构建冒充。Python131、94基线、类型/两测试lint/Node编译和checkpoint守卫（11/45/60）通过。产品路径相对已交付e7c8逐文件零差异。

日志前缀outputs/price-coordination-delivery/negotiation-ledger-*，backend-results五条、ui-results七条exitCode全部0。最后文档checkpoint后另核实精确main守卫；新候选仍未上传，旧source失败不改称成功。

## 加工前向整合

G3最终d5773dd4abe50289efc4b527d481643e4b8a9c64精确守卫PASS（11/45/60）。加工从clean已交付且新三CI绿1ab0d8c0598a4cf270bf2618ece260bcbcbf20f5前向合入，测试两文件冲突按119原文件保留新推送/选择/用例范围，仅应用清单helper与来源Modal只读断言；没有整块回退到Source旧入口，也未恢复119已经移除的参考批次交互。共享摘要原文逐字归档至completed/2026-10-19-before-processing-ledger-{handoff,current-state}.md，原始提交完整保留。随后整合本机交付文档回执，保存clean checkpoint后验证受影响测试，不自动重复上传。

加工先保存030fdaba029ce08cddf1858e50d266a365ac9f31，再合入仅文档交付记录10e39c8600570b63d27974a236032574f5e4c970为clean checkpoint5a5228a8986bacdb5085b929c5dbac71dc02ac82。相对已三CI绿1ab0，运行/UI/SQL/依赖/工作流/脚本逐路径零变化，只有两份测试和文档不同。

5a5228a8在clean状态通过操作21、实际CLI durable readback、加工批次实际Chromium8、类型/两个测试lint/MJS语法、94基线及checkpoint守卫（11/46/71）。Server UI候选的build-info精确为5a5228a8；最初并行前端/Node编译争用dist/server导致ENOTEMPTY，失败日志保留。核实输出目录为本工作树内普通目录后，按现有Dockerfile.server的build→server:build顺序重新成功构建并跑8项UI；没有手动删目录、改配置或操作既有演示。这是执行顺序修正，不是产品修复。

新本地补充范围只覆盖改变的测试及各上游未到达尾部；未重复119已Hosted通过且产品完全相同的全部工作流，未将旧898/261/84或119原Hosted结果标成新候选全重跑。新候选Hosted仍待实际交付核实。精确最终文档checkpoint守卫另保存于outputs/price-coordination-delivery/processing-ledger-final-exact-guard-2026-10-19.log。

## 最终状态与后续范围

Source候选1b08ea9348ecf377c1b4e4cdea4ba5d574a2250a、G3候选d5773dd4abe50289efc4b527d481643e4b8a9c64均本地完成并通过精确守卫；加工已前向保留两者及原1ab0/10e39，最后仅文档收口，最终HEAD以Git与下一次交付manifest完整SHA为准。无继承dirty或未提交源码；没有第二次push、创建新PR、合并或部署。远端仍为117/92623、118/e7c8、119/1ab0，旧source红灯保留，不能称新测试修复已送达。

下一次最小交付可仅上传一次加工最终提交，独立exact SHA和原commit存在后，再force=false快进117/118到上述候选；必须先取得这个新精确范围的答复，本轮指定1ab0一次许可已用完。既有唯一草稿不重复创建。110原三绿、119/1ab0新三绿不构成累计PR自动合并或真实部署授权；114最新独立增量继续不在本次整合中。
