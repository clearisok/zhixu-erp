# D145交付后的引用兼容复审

2026-10-18；main再次核实为064e3afaf7d08b3cb62907d4402f97d9c292f1e5。前向补充[首轮交付与CI修复](price-coordination-delivery-ci-2026-10-17.md)，不覆盖原日期、SHA、失败结果或冻结证据。

## 本轮已授权交付

按用户对指定SHA的新授权，仅对feat/processing-quote-push-and-selection真实push一次16614c8ef5893ffd11036b1202c655a4d647a809。工具再次报告STOP_AUTH_OR_DIVERGENCE同时返回精确远端SHA；独立GitHub ref API确认目标，未重复push。随后确认原始commit对象存在及祖先关系，通过既有Git refs API、force=false将117快进至f43bfdae2d09b2450edf0c7f0cf7c599686f41a6、118快进至4d2bad59c761c2fe9f6118c25b04fc48e0464010，分别独立核实；未重造commit或更换认证/TLS配置。117/118/119保持唯一草稿PR并已更新/attach。

三个新source run为117=39087058406、118=39087062249、119=39086997767，均越过已修复的31项商业/七角色测试，在旧引用清单的预览回归失败：Source缺0028颜色身份，议价/加工还缺0029回执。实际安全行为保守返回unknown，并非丢数据或放开归一。

## Source阶段

开始分支feat/order-business-source，HEAD f43bfdae2d09b2450edf0c7f0cf7c599686f41a6，工作树干净；保留已发布提交。固定声明sales_order_color_identities及sales_order_commercial_lines的sales_order_id引用，读取计数/样例及完整行指纹；不输出载荷或金额。两个表全无仅支持升级前演练，半套schema明确阻断。没有改SQL、公开API、权限或UI，没有恢复已退役归一操作。

新增合成回归检查真实首次采用后的两类引用计数/指纹、金额不外泄、半套schema和未知FK/外部覆盖仍阻断。验证结果在阶段结束后记录。

扩大本地后续检查发现两处独立旧测试假设，并只修测试：0019旧库升级后的全部旧字段继续逐值比较，同时明确断言0028新增legacy_uniform/source_adoption/null默认值；暂停期间对已有价格的来源预览为409，另外使用未定价合同验证预览200、有效首次采用503且零版本写入。没有开放有价订单重选来源，没有放宽暂停。

Source阶段本地通过：38预览/案件、31完整证据/受控执行、21岗位工作区、45归属/SQL、18命令暂停/回退、9来源、31商业/七角色，共七组193项；类型与五个修改源码/测试的目标lint通过；精确main源码守卫11页/45能力/58UI路径通过。这些是多条命令的定向范围，不冒称完整Hosted工作流或旧898/261在本提交重跑。日志前缀outputs/price-coordination-ci2-source-*；失败旧日志保留，归属/暂停使用-fixed日志记录修正后通过。

当前上传一次的授权已按指定16614执行完毕。后续新修复先本地完成并以精确提交给出范围，不能据此重复上传或自动合并部署。没有操作真实账号、业务库、旧演示、艾诺科新查询/绑定/激活、调度、宁波或18443/18444。

## 议价阶段

Source完成为e4c76fc7af736bc26a3f99b2728659e3c9c58607，该精确提交源码守卫通过。议价开始于clean 4d2bad59c761c2fe9f6118c25b04fc48e0464010，前向合入Source，只接力摘要冲突由整合者协调，原提交完整保留。

0029回执纳入固定sales_order_id引用，样例键为operation_id，完整证据对全部尝试行生成指纹；操作表中明确定义的command_plan.salesOrderId同时纳入完整证据，因此已登记但尚无回执的计划也不会漏掉。仅对这条已知JSON关系处理，不声称覆盖所有JSON或外部系统。完整证据仍有行数/字节预算、权限及外部覆盖限制，只返回摘要，不输出计划、原因、工价或售价。两表半套schema503，整组不存在仅旧schema演练。未新增schema/API/权限或恢复归一入口。

新增回归通过真实首次采用后议价，核对颜色、商业明细、议价回执与操作计数和指纹；另外在一次性库登记未消费计划，确认即使回执数量不变也使完整证据过期。验证结果在阶段结束后记录。

议价阶段八组207项通过（39预览/案件、32完整证据/执行、21岗位、45归属、18暂停、9来源、31商业、12议价）；追加完整证据文件11项验证FOR SHARE锁定新增引用及计划时生成相同指纹，单独记录不重复累计为新场景。类型、六个修改源码/测试目标lint及精确main工作树守卫通过（11页/45能力/60UI路径）。日志前缀outputs/price-coordination-ci2-negotiation-*。

本轮三PR的baseline/team-access均已通过，source失败保留，不重跑旧SHA。#110 e70deacfe446088677aa3d96e998436b730cb7af三绿未变；新本地修复尚未交付。

## 加工整合阶段

从clean feat/processing-quote-push-and-selection / 16614c8ef5893ffd11036b1202c655a4d647a809前向合入议价修复c646e2d8ce9a866b8ed12e26ececdc6cef465fa3；原始业务及本轮原交付提交均保留，仅AI_HANDOFF摘要冲突由整合者协调。先保存整合checkpoint，再按实际source工作流逐项本地验证后续命令，结果另记；没有将尚未运行的检查写成通过。

Source后续独立补回：整合483e0c17扩大浏览器检查时，material-history一处旧测试仍等待“当前订单仅允许查看来源”，实际D145 Modal正确显示“当前订单只读。”。从clean e4c76fc7返回Source分支，只更新测试文案/名称，并加强无input/select/textarea、无可用采用按钮的验证；原请求零写入及全历史表快照比较保留。产品文案、布局、权限与运行代码不改。加工整合其余九条UI命令通过；最终对修复文件在正确的整合候选上单独重跑。

此补回已在Source自身显式Server构建（业务源码e4c76fc7，build price-ci2-source-history-e4c76fc7）通过9项实际Chromium；无产品源码差异，新增测试本身lint及语法检查通过。日志outputs/price-coordination-ci2-source-history-{build,ui-fixed}.log。加工候选前向同步后再确认同一文件，旧失败日志不删除。
Source最终测试修复92623fe652fa9c650bb185a2494907e5d63e03d1的精确守卫通过（11/45/58）。议价分支从clean c646e2d8前向合入，仅复审记录追加段冲突由整合者保留双方内容；相对c646e2d8生产目录零差异，不重跑无变化业务来虚增验收次数。
议价最终补回e7c8bafdb732827bbcde340bf6f7a3ba3281e071的精确守卫通过（11/45/60）；加工从clean 483e0c17前向同步，仅复审追加段冲突保留双方，生产目录相对483e0c17零差异。剩余只对修正后的历史来源UI重新构建验证，然后收口当前状态与精确提交门禁。
