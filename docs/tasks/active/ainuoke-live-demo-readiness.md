# 本机真实 Source 演示准备

核实日期：2026-10-13；GitHub main 基线：`064e3afaf7d08b3cb62907d4402f97d9c292f1e5`（PR107 已合并）。
分支：`feat/ainuoke-live-demo-readiness`；开始时 HEAD 同基线、tracked/untracked 均干净。
更新时机：预检工具/预算/真实回执、目标归属、人工验收、main/PR/部署状态变化时。
GitHub 是实时工程事实源；文档是阶段性快照。旧状态原文见[归档](../completed/2026-10-13-pre-live-demo-status-snapshot.md)。

## 用户决定与本轮范围

用户授权合并 #107，并在后续“继续”中接续本机真实演示准备。仍保持现有 UI，不修改真实账号或织序业务数据库，不部署宁波/18443/18444，不自动合并本轮 PR。真实上游读取由用户在私密终端显式执行；Codex 不读取账号密码文件，只核对脱敏回执及受保护的本机报告。
永久 HTTP 例外仅沿用 D109 已批准的原地址；不扩大目的地。Excel 模板由用户填写，本轮不覆盖、不导入。

## 已确认事实

- GitHub PR104/105/106/107 均已合并。#106 merge `957fe1a6eedfd6a92020ef2cf82d710a4162cda0`；#107 merge `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`，head `31b5f28862d032fc954b3f831888005f14060a1c`。#107 Source / baseline / team-access 三项精确 head CI 成功，Source 44/44 含 Linux CLI 真实持久化的合成流程。合并不等于部署。
- 当前代码支持全部可见合同首次绑定、四流持续快照、QtyUnit 逐需求单位、显式选择 1–25 新合同的受控接纳。已有订单主信息/颜色不自动刷新；没有自动新合同建单。
- 真实只读历史证据：558 可见合同两遍一致，80 合同物料抽样；62 合同有未知数量。单位目标三行人工身份与 IT 语义已确认，不代表全量质量已确认。持续来源尚未激活。
- 本轮实际代码：`server/ainuoke-source/live-preflight.ts`、`demo-plan.ts`、`scripts/ainuoke-live-preflight.ps1`。复用 collector、正式 binding preview 和同一 Material Pipeline / Projection；不调用 Pool/迁移/绑定/持久化写命令。

## 工程 Gate

1. G0：恢复 main、PR、工作树；归档旧状态，不把旧“未合并”继续写成当前。
2. G1：无数据库的全量预检。第一 worker 完整 6086103 → 所有可见 BillNo 的 6087105 → 6086103；第二 worker 完整 6086103 → 相同全集经当前 InsideOrderNo 查询 6087050 → 6086103。不按 Status 排除、不抽样。每 worker 使用生产现有 600 秒、100000 行、32MiB、每报告 200 页/50 行及 10 分钟 freshness；不扩大预算掩盖失败。输出每阶段耗时、返回页/行/序列化字节；返回页不是 HTTP 尝试次数，重试次数未插桩。
3. G2：合成负向验证完整范围/分页/身份/来源变化/时效/预算/秘密字段/单位未知与冲突，以及 Windows NTFS ACL、ignored 文件和只输出计划的目标限制。
4. G3：typecheck、lint、root/server build、源码门禁、Source 回归与精确 PR CI；提交本轮唯一 PR，复审，不自动合并。
5. G4：用户私密运行全量预检；未实际运行前明确“未验证”。失败保留脱敏阶段收据，不缩小范围或改 unknown 为零。来源跨阶段变化须重查或设计容量分批方案，不能冒称 ready。

## 私密终端命令与数据保护

工程已提交且依赖齐备后，用户在普通 PowerShell 单独执行：

```powershell
pwsh -NoProfile -File C:/Users/Administrator/.codex/worktrees/ainuoke-live-demo-readiness/zhixu-ainuoke-api/scripts/ainuoke-live-preflight.ps1
```

私下输入用户名及隐藏密码。两个独立 worker 最多约 20 分钟，验证/包装有额外短时开销，期间可能无输出。最后只回传脱敏 JSON，不发密码、完整终端记录或私有明细。
也支持用户自己显式加 `-CredentialFile D:/workspace/ainuoke-key.txt`；文件必须是当前用户拥有的普通文件，只有当前用户/SYSTEM 可读，无链接。格式为两行“账号：…”和“密码：…”。脚本不修改该文件权限、不保存密码、不把内容交给 Codex；宽权限或空密码拒绝。建议使用默认隐藏输入，避免为了运行工具扩大文件权限。

每次新建空 `outputs/ainuoke-live-private-<UUID>/`，用 DACL 限制当前用户与 SYSTEM，并在 Node 进程和写文件前再次检查；拒绝 symlink/junction、非 ignored 路径、宽权限。不调用需 SeSecurityPrivilege 的 SACL 修改。用户名/密码只经匿名 stdin，argv/env/报告/日志不含凭据。报告仅包含后续样本核对需要的订单/需求/事件事实与单位，不保存报价金额、供应商或完整原始 payload；仍属于本机私有业务资料。

`READ_ONLY_FULL_PREFLIGHT_RECORDED` 只表示两阶段技术读取和映射完整。缺颜色是 enrichment 状态，不删主订单；缺单位、冲突单位与未知数量在报告中如实计数，不改成正常。`demoReady=false`、`operatorAuthorization=not-checked`、`sourceActivation=not-activated` 永远不会由预检升级。

## 具体演示目标（AI 建议，不是执行授权）

`plan:ainuoke:local-demo` 仅接收 `--plan`、`local-demo-<8位随机ID>`、精确 source SHA、实际 image digest、62000–63999 本机端口。纯函数输出独立 project/network/volume/database 名称、127.0.0.1 UI、DB 无发布端口、session/Server authority/snapshot 开关；没有 Compose start、建库、迁移、账号创建或绑定命令。它不能核实镜像真实构建元数据、端口空闲或资源不存在，也不能替代下一阶段启动器中的运行时阻断。

预检后准备实际候选时，逐项证明镜像源码与 build/runtime flags、资源不存在/归属、不连接旧 DATABASE_URL、0001–0012 canonical ledger、独立卷/网络、凭据只在 Linux owner-only tmpfs。然后就“这个新隔离目标”请求执行授权，不能借用18443/18444或宁波旧DB。此轮未创建或启动这样的目标。
演示停止只停自己创建的服务并保留数据卷，不采用旧合成脚本两小时自动删除机制；清理演示业务资料另需明确授权。当前已有 Docker 容器不操作。

## 推荐的首次真实演示条件（AI 建议）

- 预检完成或有明确、可解释的质量缺口处理方案；每条需求单位/未知值如实显示。
- 明确授权的独立本机账本完成完整可见合同首绑与首次持久快照；同一原页面连续 2–3 次成功刷新。
- 选 3–5 个有代表性的订单对照四流，核查单位、日期、单据身份、事件去重；故障/陈旧状态不会显示成“零/齐套”。这不是只绑定 3–5 个合同。
- 六角色仍按已有金额权限，真实团队账号留待管理员创建。用户先填基础品牌/业务员/制作方案/报价设置及少量报价即可开始体验，无需填满19个Sheet；生产/排单/关账不追加为本轮前置。

这时推荐给用户做第一次真实数据演示；24小时运行、断网/重启、备份恢复、新合同接纳与六角色业务签收，作为宁波晋升前建议 Gate。前后 Discovery 一致不能保证跨报告事务一致；历史快照无自动清理，持续运行前要估算磁盘增长。

## 当前待验证

真实全量颜色/物料读取耗时和容量、未知数量总体原因、全量单位完整性；新隔离目标的实际资源归属与镜像；真实首绑/持续采集与人工验收。本轮工程通过也不改变这些状态。用户后来回传三次失败运行；没有有效全量回执，不能将它们记为读取成功，也不能推断上游零请求。

## 本机收口

最终22项新回归、root817/817、发布基线71/71、Python69/69、Source20PASS/1skip及continuous43PASS/1skip通过；typecheck/lint/Server及默认UI build通过。无UI变化。独立本机复审未发现阻断代码问题，精确PR CI仍是合并前条件；[详细结果与交付限制](evidence/ainuoke-live-demo-readiness/final-local-review.md)。真实预检未执行。

## 用户失败回执后的修复（2026-10-13）

恢复基线：同一分支/工作树，HEAD `8d37ed06f80b0596736b1e5b8af712ee700d987d`，tracked/untracked干净；不重建工作树或另开重复PR。用户回传三次`FAIL/readonly_worker_unavailable`，本机三个对应报告目录为空。

确认的工程缺陷：原`writePrivateReport`对完整报告使用通用秘密字段检查，固定状态`operatorAuthorization=not-checked`被当作Authorization凭据拒绝；外层又将缺schemaVersion的Node失败回执遮蔽为worker不可用。合成完整状态报告复现`source_secret_field`。不推断三次实际来源读取到了哪一阶段；没有可复用的业务报告。

修复保持通用来源检查严格，只允许source-only v1报告顶层固定`not-checked`生命周期状态；其他值、错误scope、嵌套Authorization、password/token仍拒绝。CLI/PowerShell输出封闭的stage/code，异常消息与stderr不输出。真实的成功和失败报告形状均加入落盘回归；新24项定向测试通过，包括真实PowerShell→Node凭据文件启动及宽权限拒绝。首版小型合成Git仓库缺少ESM元数据而失败，补齐与本仓库一致的type=module后通过，未放宽正式校验。

用户此前指定`D:/workspace/ainuoke-key.txt`；本次仅检查元数据/ACL，并将该文件DACL收紧为原所有者/SYSTEM，未读取密码。用户在私密终端单独执行以下命令，文件内容只在短命进程内读取，不再提示账号密码：

```powershell
pwsh -NoProfile -File C:/Users/Administrator/.codex/worktrees/ainuoke-live-demo-readiness/zhixu-ainuoke-api/scripts/ainuoke-live-preflight.ps1 -CredentialFile D:/workspace/ainuoke-key.txt
```

文件格式/空值仍由脚本验证，错误不会回显秘密。全量数据完整性、Source激活与演示就绪仍未证明；[修复证据](evidence/ainuoke-live-demo-readiness/operator-wrapper-repair-2026-10-13.md)按新checkpoint冻结。此前“本机复审无阻断发现”仅是其日期/范围内记录，本次真实执行揭示的完整报告组合缺陷已明确纠正；旧证据不覆盖。
