# 私密预检包装与完整报告修复

核实日期：2026-10-13（Asia/Shanghai）；GitHub main anchor：`064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。
Branch：`feat/ainuoke-live-demo-readiness`；本阶段起始HEAD：`8d37ed06f80b0596736b1e5b8af712ee700d987d`，tracked/untracked干净。后续以记录本文件的实际checkpoint为冻结source SHA；不虚构自身commit hash。
更新时机：真实回执、工具/保护/测试、main/交付/CI或执行权限变化时；已冻结版本保留，新证据前向追加。

## 已确认事实

- 用户回传三次`FAIL`、`readonly_worker_unavailable`、`databaseAccess=none`、`sourceActivation=not-activated`。本机对应三个`outputs/ainuoke-live-private-*`目录均无报告文件；不将失败当作完整读取或零上游请求。
- 原完整报告顶层固定`operatorAuthorization=not-checked`触发通用`inspect`的Authorization秘密键检查。独立合成报告写入复现`source_secret_field`；错误输出缺schemaVersion，PowerShell回执验证再次失败并遮蔽为worker不可用。这是确定的组合缺陷；三次运行实际读到了哪一步无法恢复，网络/账号/数据质量没有据此归因。
- 用户指定的本机凭据文件存在、是普通文件且由当前操作人拥有；原权限继承了其他主体。本次只通过ACL/元数据检查和icacls将DACL限制为原所有者与SYSTEM，未读取或修改账号密码内容。脚本以后只接受严格权限文件，不自行扩大权限。

## 用户决定与约束

用户要求使用已提供的凭据文件路径，免去重复隐藏输入。真实执行仍由用户在私密终端显式调用；账号密码不进入Codex、argv/env/Git/DB/报告。只读取固定报表；不接织序DB、不绑定、不激活Source或部署，不改现有UI/数量/单位业务规则，不自动合并。

## 实现与验证证据

实际路径：`server/ainuoke-source/live-preflight.ts`、`scripts/ainuoke-live-preflight.ps1`、`server/integration/ainuoke-live-preflight.test.ts`。

- 只对source-only v1、DB none/Source not-activated的报告顶层固定状态做窄例外；通用来源inspect保持严格。不同operatorAuthorization值/错误schema与生命周期、嵌套Authorization、Authorization/password/token依然拒绝。
- CLI失败始终是封闭schemaVersion/stage/code及none/not-activated；PowerShell分开报告运行时、目录、凭据、启动、stdin、等待及回执失败。不会回显异常消息、stderr或文件内容。
- 24/24定向回归PASS；包括完整成功和失败报告实际owner-only落盘及hash、秘密负向、CLI失败真实子进程、Windows私密CredentialFile→实际Node CLI的stage/code保留和宽ACL拒绝。所有来源为合成；凭据空白在配置校验前置拒绝，绝无真实上游请求。
- 类型检查、增量eslint（max-warnings=0）、Server build、PowerShell AST解析、diff-check通过。最终发布基线/root在后续收口记录，不用旧PASS冒称修复后结果。
- 新PowerShell集成测试首次因小型合成Git仓库缺少ESM元数据失败；补齐与本项目一致type=module后24/24通过，没有弱化实现或跳过Windows测试。

此前22项PASS/本机无阻断结论没有覆盖“完整状态报告＋实际包装启动”组合；本次缺陷纠正该测试覆盖不足，旧记录仍按其日期保留。未将技术失败升级为人工验收、Source激活或可部署。

## AI建议与待确认

用户通过CredentialFile完成下一次完整读取后，只回传末尾脱敏JSON；助手核对受保护报告及hash，再判断容量/单位/未知数量与隔离演示方案。不能借失败缩小全集、增加超时预算或填unknown为0。
GitHub交付此前NETWORK_DEGRADED、远端分支未送达；本次沿用已有worktree/branch保存本地checkpoint，不反复推送，不造PR/CI成功。新真实回执、首绑/持续采集、演示库或部署均尚未证明。
