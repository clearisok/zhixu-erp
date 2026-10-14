# 异常列开发前恢复点（历史）

来源：9c95db5阶段未改共享摘要，父恢复点67f094da39b531ea296090e8fa1e4d6c29a84b56。下列内容保持原文，仅代表当时状态，不替代当前摘要。

## CURRENT_STATE

2026-10-14 / D-116 后续：用户确认两笔重复采购均真实有效；只排除颜色及所有数量均空的占位，具名未知保留。既有六合同离线重放3份恢复usable、3份共9条具名未知仍invalid；未知不填0，用户已确认这批标签只/个严格1:1，受控范围映射尚未接入。见[治理更新](tasks/active/source-anomaly-followup-2026-10-14.md)。本阶段起点7b02cbd clean，main基线064e3afaf7d08b3cb62907d4402f97d9c292f1e5未刷新。两分支用户交付均pushes=0，REMOTE PENDING；只推进本地工程，真实Source未激活。

2026-10-14 / GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`：PR108 head `8b89de59dd405395da1dde4b6dde5f125141deb9` 开放未合并。本轮独立分支只读追查单位/颜色/负数量/空物料；具体原因与真实演示阻塞见 [异常治理](tasks/active/source-anomaly-followup-2026-10-14.md)。旧摘要均为历史时点，真实 Source 未激活。

# 当前状态

2026-10-13 / GitHub main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0`：PR #106 QtyUnit 已按用户授权合并，三项精确 head CI 成功；真实 Source 仍未激活。D-112 在独立 `feat/ainuoke-controlled-contract-intake` 工程分支实现完整 Discovery 差异、显式选择新合同、只读预览、重取确认、同事务创建/审计与精确重试；此分支尚未合并，未操作真实账号、DB 或宁波环境。本机已通过 817 项 root 测试、71 项发布基线回归、Python 25 项、合成 PostgreSQL 定向验证、typecheck、lint、Server/UI build，最终 PR CI 待远端运行。[工程边界与测试](tasks/active/ainuoke-controlled-new-contracts.md)。宁波上线仍缺真实持续四流、受控新增合同业务验收、隔离候选/备份回退与人工批准。下文旧 SHA、PR 状态与样本数字仅作历史快照。

核实2026-10-13；GitHub main：8b3f3d811d05182ea1a7f3214eae9d530056fa04（PR103已按用户授权合并）。GitHub是实时事实源；随main/PR/测试/探测/验收/环境变化更新。

- D109原艾诺科HTTP长期接受及私密首页probe已合并；PR103精确head1de3078三项CI成功，无行级审查问题。此前source的Chrome启动超时、同提交重跑通过记录保留。
- D110当前分支feat/ainuoke-readonly-validation，PR104开放未合并；只读工具、测试及证据。[任务](tasks/active/ainuoke-readonly-validation.md)。
- PR104仍开放未合并。其精确head派生的独立诊断分支已有草稿PR105；用户在普通PowerShell成功完成一次定向只读采集，私有报告已与三行截图对照。[脱敏真实证据](tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)。一遍558合同/12页Discovery仅为身份定位，三个指定合同完整物料18次固定报表请求；目标采购单四来源行归并三采购事件，118/356/6均找到对应字段。人工业务确认0/3、API单位映射0/3，unknown保持未知。曾因Set-Acl权限失败的包装已改成只读核对预受限ACL，普通终端重试成功；最终PR精确head CI需随本次证据提交复核。
- 本机新受保护报告已出现6087050原始QtyUnit候选：目标采购四来源行均为“个”，三物料身份/数量及356归并事件与旧报告一致；来源行身份随字段增加变化。[脱敏复核](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)。报告仍标记单位语义及人工业务验收未确认；IT/业务方须确认QtyUnit与TotalNum、cgnum及四流口径的关系，未实施正式映射。
- 用户真实执行回执已与本机私有文件核对：558个可见合同两遍完整且一致；抽查80合同完整物料分页，1空/0无效；采购79、其余三流各75个合同有合格样例，四流共享R01–R03三个代表合同。[真实结果](tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)。不是558合同物料全量或全公司权限证明。
- 62合同有数量未知；四流未知需求项184/250/341/258，不能相加为独立问题数。单位未映射；旧80合同报告缺物料维度/原始字段；新三合同诊断能分类少量观察，但仍不能确定62合同总体根因或完成逐物料业务验收。既有unknown保护保持，不填零、不跨物料加总。全量6087105颜色仍未核对。
- 新诊断仅对指定三行及最多两个旧问题合同给出来源行级观察、归并事件和单位候选；即使真实运行，也不能直接推断62合同总体根因。任何单位映射/正式计算修改待来源字段与界面业务含义确认后另行PR。
- 现有UI、SQL、Source/orderRead默认开关与生产路由不变。未修改真实账号/业务DB，不部署宁波/18443/18444，未绑定或启动持续写入，新PR不自动合并。
- 工程head5d77355568913f96d91c2ff37541b1ee6a9c3adf：审计8/8、Python66/66、root810/810、类型/lint/server/build、本机基线71/71及守卫PASS；来源20/1skip、continuous29/1skip、readiness9/1skip。该head三CI成功，Ubuntu已补Linux分支；本次仅补真实证据/状态，最终CI以PR104精确head为准。
- D105持续展示后才上线宁波。当前草稿PR105提供只读数量/单位/逐物料诊断；其后仍需人工字段语义确认、真实规模/颜色核对与独立目标首绑方案；具体写入授权、持续运行及人工验收仍待。新增合同自动建单、主信息/颜色增量及完整分码UI未实现。宁波隔离、备份恢复、候选和上线授权仍独立Gate。
- 历史Quote扩展UI的8项失败及父测试失败未处理，不声明全项目全绿。旧冻结截图、现场观察与历史提交保留。

功能：[来源](features/AINUOKE_SERVER_SOURCE.md)；决策D105–110；[宁波方案](ops/ningbo-rollout-plan.md)。


## AI_HANDOFF

2026-10-14 最新回执：六项有流水缺单位中4项人工确认为个、2项上游确缺且生效不能补，禁止猜单位。空流水代表需求实际由工厂自购，国贸无需采购；来源仍自购而代码只排除厂供是未排除原因，需独立需求级责任确认，不能改写来源或外推全量。详见[治理记录](tasks/active/source-anomaly-followup-2026-10-14.md)。本阶段起点0a894fa clean，纯文档确认，无真实写入。

2026-10-14 最新业务回执：问题负采购单用户已删；负入库为质量退库；四空物料合同均取消。原因已确认但接口未重读，旧报告保留。缺单位1750项中仅6项已有事件、1744项四流空（旧全量报告离线分类）；三张采购单六项单位和一条空流水需求实例见私有清单，公开脱敏更新见[治理记录](tasks/active/source-anomaly-followup-2026-10-14.md)。本阶段起点27264e4 clean；无代码/真实DB/部署变更。

本地最终验收：源码828、定向57、首绑预览18、基线71及门禁、typecheck/lint/Server与UI构建均通过；既有六合同离线重放3恢复、3保留具名unknown。报价分支a0e60e4未改动；两个分支仍REMOTE PENDING。本轮旧7b02cbd恢复命令已过期，应以后续最终HEAD为准；勿重复要求用户运行失败命令。

2026-10-14 / D-116 后续：用户确认两笔重复采购均真实有效；只排除颜色及所有数量均空的占位，具名未知保留。既有六合同离线重放3份恢复usable、3份共9条具名未知仍invalid；未知不填0，用户已确认这批标签只/个严格1:1，受控范围映射尚未接入。见[治理更新](tasks/active/source-anomaly-followup-2026-10-14.md)。本阶段起点7b02cbd clean，main基线064e3afaf7d08b3cb62907d4402f97d9c292f1e5未刷新。两分支用户交付均pushes=0，REMOTE PENDING；只推进本地工程，真实Source未激活。

2026-10-14 / GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`：PR108 head `8b89de59dd405395da1dde4b6dde5f125141deb9` 开放未合并。本轮独立分支只读追查单位/颜色/负数量/空物料；具体原因与真实演示阻塞见 [异常治理](tasks/active/source-anomaly-followup-2026-10-14.md)。旧摘要均为历史时点，真实 Source 未激活。

# AI handoff

2026-10-13 / 最新接力：用户授权合并 PR #106，GitHub main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0`。独立工作树 `ainuoke-controlled-new-contracts`、分支 `feat/ainuoke-controlled-contract-intake` 从该精确提交开始，D-112 工程与本机验证已完成：root 817/817、发布基线 71/71、Python 25/25、持续来源 43 PASS / 1 Windows 跳过、typecheck/lint/Server/UI build 通过。精确重试现校验已存 Contract/Color Mirror，避免只凭审计收据误通过。只添加显式新合同，旧订单主信息/颜色不自动刷新；真实来源、业务 DB、宁波/18443/18444 均未操作。交付与合并前复审须以该分支唯一 PR 的精确远端 SHA 和 CI 结果核实，尤其 Linux CLI 全流程；本任务不自动合并。[任务](tasks/active/ainuoke-controlled-new-contracts.md)。下文为历史接力。


核实：2026-10-13；GitHub main 8b3f3d811d05182ea1a7f3214eae9d530056fa04。此工作树在 feat/ainuoke-targeted-diagnostics，草稿 PR #105 以开放 PR #104 head b43b78bee72a496219bd4872245ad28109f421c4 为 base。开始前重新核对 PR/head、git status 和当前代码；不要把聊天记录当事实源。

本轮范围只有定向只读诊断：一遍 6086103 精确销售合同号查当前 InsideOrderNo，最多三个指定合同完整 6087050。用户在普通 PowerShell 隐藏输入凭据，2026-10-13 回传成功。助手核对本机受限、Git 忽略的报告和仅三行的截图对照表；公开脱敏结果见 [真实证据](tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)，执行边界见 [任务](tasks/active/ainuoke-targeted-diagnostic.md)。不要提交 outputs/ 的合同号、来源身份、物料或凭据。

目标三行 118/356/6 均找到对应名称、颜色、规格、采购单号、日期；356 两来源行归并同一采购事件，不能相加为 712。物料编码仅在私有 API 报告，截图未显示，仍待上游界面核对。三行无可信 API 单位，截图“个”不自动成为正式映射；人工业务确认 0/3，正式单位映射 0/3。62 合同未知数量的总体根因仍未知，投影保持 unknown/null。

后续受保护报告出现QtyUnit候选：目标采购四来源行均为“个”，原三物料身份/数量与归并事件不变，四来源行身份因新字段改变。该报告mtime 2026-10-13T03:24:45.2988793Z，来源语义仍未确认；不能据字段名改正式映射。公开脱敏证据见 [QtyUnit 复核](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)。本机后续私有请求已缩至目标单，若无证据缺口无需再要求用户重复读取。
首次普通终端运行在 Set-Acl 因缺 SeSecurityPrivilege 而于登录前失败；修复为只读检查受限 ACL 后真实重试成功。工程修复 head cef2e5653524bb65a80b8f9787e0ab937390d88b 已精确推送，手动 Source CI run 38339696861 全成功。此次真实证据文档提交后仍需按最终 head 复核 CI。PR #104/#105 不自动合并；未改正式计算、UI、真实账号/数据库、Source 激活或部署。

下一步：完成本次脱敏证据提交与最终 CI/PR #105 复审；用户在本机三行表核对物料编码/规格，确认界面“个”的业务含义。若 6087050 没有可信单位字段，另找受授权只读字段来源；只在字段身份与业务语义确认后另开最小映射 PR 和负向测试。真实绑定、持续采集、全量颜色/规模与宁波上线各需独立 Gate。
