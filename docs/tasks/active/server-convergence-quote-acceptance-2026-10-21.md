# Server 收敛：旧报价验收维护

## Baseline and scope

2026-10-21，root 唯一 writer，沿用已批准的一个独立只读审查者。
本阶段从独立 GitHub API 核实的 main `996dfedc12da3527343cd3ff2aa5eea35497e10e`
干净创建 `codex/server-quote-acceptance`，显式 fast-forward 到已交付的
`4e10596329e5ac6418a76ccf05123de47df54545`。没有继承 dirty、reset、clean、rebase 或其他工作树修改。

Gate6B 的精确 4e10 Source [39464481379](https://github.com/clearisok/zhixu-erp/actions/runs/39464481379)、
Team [39464487383](https://github.com/clearisok/zhixu-erp/actions/runs/39464487383)、
Baseline [39464494767](https://github.com/clearisok/zhixu-erp/actions/runs/39464494767)
已经逐项核实 completed/success、head SHA 一致、run attempt 1；本阶段没有重新调度它们。
原 #120–127 和 main 未合并或关闭。应用源码及既有本机 Server 构建仍为
`919643d8cde2b0ec22987631e685e6a661829881`；本阶段开始时没有应用、SQL 或权限目录变化。

4e10 的 CURRENT_STATE、AI_HANDOFF、PROJECT_INDEX 按真实 Git blob 逐字归档到
`../completed/2026-10-21-quote-acceptance-inputs/4e105963/`，原日期/hash/结果/限制保留。

## Why this slice

[原工程证据](../completed/2026-10-20-order-quote-context-engineering.md)明确记录旧 Quote+P6 长套件
45 pass / 44 fail / 2 cancelled，439204ms；31 个后续用例因父测试结束没有启动。
这不是当前整产品验收通过，也不能用新排单 CI 替代。6C 的两项权限/产出归属业务问题仍待人答；
本轮维护该独立验收缺口，不实现依赖这些答案的执行写入。

## Allowed changes and retained assertions

- 仅旧 Quote 浏览器验收、相关合成 fixture/驱动、必要的验收 CI 接线和状态文档。
- 按当前 orderRead 开关验证正式订单页面或默认关闭；不能恢复过时的“订单全部关闭”。
- 加工验证纯工价的页面、响应和工作簿，旧隐藏成本事实保留；经销仍验证完整 Estimate 生命周期、
  动态材料扩行以及 null/zero。不能以删除金额断言消除失败。
- Server 使用已保存报价确认依据；不等待只属于 Browser 的未关联提示。
- 合同/加工批次创建并明确采用报价，CCT 是报价确认源，订单使用自己的商业快照；
  旧订单 PATCH 应拒绝，不恢复共享可变成交价。
- 客户确认/导出正控明确具备独立金额权限；无权限负控和原始工价的成本权限保护继续保留。
- 将核心、Estimate、确认、CCT、客户导出/审计、列表汇总、直接创建及方案/响应式验收分阶段，
  各自有界预算，fixture 失败不继续本阶段依赖用例。后续独立阶段不再被同一个四分钟父预算取消。
- CDP 命令有界，连接关闭拒绝未决调用；仅只读轮询处理精确导航上下文失效，不重放点击或写入。
- 必须实际执行此前未启动的工作簿解析、ZIP 部分失败/25项限制、历史图片、无公式/外链、
  跨账号设置、撤权、只读日志和制造方案/多尺寸场景。失败、跳过或取消均如实记录。

## Review and validation status

既有独立审查者对 4e10 旧文件完成只读预审，确认上述旧假设和未启动范围；未替其声称运行测试、
DB 或网络。另指出加工 Estimate API 没有显式类型拦截的待核验边界；尚未执行该请求，
不把静态风险记为已复现产品缺陷，也不以恢复旧加工 UI 处理。

实际工作树验证（均为一次性合成 PostgreSQL/内存对象存储与专属 Chromium profile）：

- working-1：54 pass / 11 fail / 0 cancelled / 0 skipped，105527.8342ms。弹窗未就绪、
  明确fixture仅49条导致第二页24条、加工运费投影null的旧断言；后续独立方案/响应式阶段实际运行。
- working-2：75 pass / 5 fail / 0 cancelled / 0 skipped，93547.4871ms。CCT旧raw字段断言
  未适配现有commercial-terms-read.v1嵌套金额；日志详情异步读取未完就断言。未改产品。
- working-3：84 pass / 3 fail / 0 cancelled / 0 skipped，125581.7341ms。唯一失败leaf为
  日志关键词已是SearchField，旧label.qc-form-item填表方式不适用；另两项为其父节点。
- working-4：87/87，158141.1777ms，0 fail/cancel/skip；含阶段和parent节点，不冒称87个独立业务场景。
  Quote页面、两种确认、CCT与订单独立、XLSX/ZIP/汇总/日志、4个直接创建及12个方案/响应式场景均实际执行。
  该轮运行期间只再补最后的中止catch安全标记，不将其冒称最终冻结源码验证；随后须精确复核。

全部原失败日志保留于ignored outputs，未覆盖旧45/44/2证据。类型、Node编译、全仓lint通过。
独立reviewer先后发现并复核了阶段signal绑定、独立受控Fetch清理、子例catch重抛前unsafe标记；
最后窄复审无新增阻断，仅静态阅读。新增真实CDP自检覆盖同一中止catch，既无业务重放，也不复位实际安全状态。
三个测试/驱动文件、原Source workflow增加本套件命令及文档之外无产品变化。
两类截图输出改为每次唯一子目录，原冻结PNG/哈希不改；当前应用及前端build仍919643。
全项目927/927（273651.1289ms）、显式基线116/116（265684.7854ms）已实际通过，均0fail/cancel/skip。
三个测试驱动不在项目静态测试的导入链；最后scope catch只影响本套浏览器，未据此重跑未变的全部产品SQL。
源码checkpoint `2e1b9efd835061015b538d5ba499a3d027ec29da` 的精确main996守卫PASS
（11页/50能力/60继承UI路径，本阶段无UI增量）。冻结浏览器87/87（120270.9772ms），0fail/cancel/skip。
随后核对保留覆盖，额外保留加工第二PV的USD工价导出断言：仅修改适用工价币种，
数据库和输出不换汇；材料扩行/null/zero仍在经销。
最终源码checkpoint `84cd2376512a7835a8a10abd4dc6a0671245553d` 的冻结完整浏览器
87/87（114428.0135ms），0 fail/cancel/skip；精确main996守卫PASS，仍11页/50能力/60继承UI路径。
本地验收完成；本批远端精确交付与新CI尚未核实，不引用4e10绿灯作为本批结果。
复验仅一次性合成库/内存对象/专属profile，已核对该轮owned cleanup PASS；没有升级既有体验环境。
最终独立只读复审对84cd源码、87项实际日志、精确守卫和输入Git blob归档未发现阻断；
确认USD覆盖未削弱原工价/未确认/隐藏金额/经销材料断言。复审未自行运行测试、数据库或网络。

## Boundaries

不改 Browser Repository/Seed/存储 namespace，不安装依赖，不升级 3001/50426/59069/62426，
不接入真实账号/业务库、不新增艾诺科读取/绑定/激活/调度、不部署、不合并/关闭 PR 或退役资产。
冻结证据、旧 PNG、237 evidence / 50 capability 不因测试维护而修改。
安全工程 Git 交付沿用持续用户授权，不逐次询问；仍需有界一次上传、独立精确远端核实及新 CI 事实。
整体 Goal 保持 active；本任务不把报价验收维护缩称整个 Server 化已经完成。
