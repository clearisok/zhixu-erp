# 当前状态
核实2026-10-13；GitHub main：8b3f3d811d05182ea1a7f3214eae9d530056fa04（PR103已按用户授权合并）。GitHub是实时事实源；随main/PR/测试/探测/验收/环境变化更新。

- D109原艾诺科HTTP长期接受及私密首页probe已合并；PR103精确head1de3078三项CI成功，无行级审查问题。此前source的Chrome启动超时、同提交重跑通过记录保留。
- D110当前分支feat/ainuoke-readonly-validation，PR104开放未合并；只读工具、测试及证据。[任务](tasks/active/ainuoke-readonly-validation.md)。
- 基于PR104精确head的独立`feat/ainuoke-targeted-diagnostics`已有草稿PR105，准备少量合同的只读字段诊断及合成测试；一遍当前可见Discovery只用于可信InsideOrderNo定位，最多三个合同读取6087050，不重做80合同验收。[诊断任务](tasks/active/ainuoke-targeted-diagnostic.md)。普通终端首次启动在ACL权限处停止，未读取上游；修正待最终head CI和用户重试，三行来源身份/单位仍待人工核对。
- 用户真实执行回执已与本机私有文件核对：558个可见合同两遍完整且一致；抽查80合同完整物料分页，1空/0无效；采购79、其余三流各75个合同有合格样例，四流共享R01–R03三个代表合同。[真实结果](tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)。不是558合同物料全量或全公司权限证明。
- 62合同有数量未知；四流未知需求项184/250/341/258，不能相加为独立问题数。单位未映射；当前私有报告缺物料维度/原始字段，尚不能判断根因或完成逐物料业务验收。既有unknown保护保持，不填零、不跨物料加总。全量6087105颜色仍未核对。
- 新诊断仅对指定三行及最多两个旧问题合同给出来源行级观察、归并事件和单位候选；即使真实运行，也不能直接推断62合同总体根因。任何单位映射/正式计算修改待来源字段与界面业务含义确认后另行PR。
- 现有UI、SQL、Source/orderRead默认开关与生产路由不变。未修改真实账号/业务DB，不部署宁波/18443/18444，未绑定或启动持续写入，新PR不自动合并。
- 工程head5d77355568913f96d91c2ff37541b1ee6a9c3adf：审计8/8、Python66/66、root810/810、类型/lint/server/build、本机基线71/71及守卫PASS；来源20/1skip、continuous29/1skip、readiness9/1skip。该head三CI成功，Ubuntu已补Linux分支；本次仅补真实证据/状态，最终CI以PR104精确head为准。
- D105持续展示后才上线宁波。下一PR建议只读数量/单位/逐物料诊断，随后真实规模/颜色核对与独立目标首绑方案；具体写入授权、持续运行及人工验收仍待。新增合同自动建单、主信息/颜色增量及完整分码UI未实现。宁波隔离、备份恢复、候选和上线授权仍独立Gate。
- 历史Quote扩展UI的8项失败及父测试失败未处理，不声明全项目全绿。旧冻结截图、现场观察与历史提交保留。

功能：[来源](features/AINUOKE_SERVER_SOURCE.md)；决策D105–110；[宁波方案](ops/ningbo-rollout-plan.md)。
