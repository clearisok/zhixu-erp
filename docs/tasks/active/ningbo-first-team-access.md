# 宁波首批六角色接入

核实日期：2026-10-12；GitHub main：01694d723cd7b65fcc20e3e79941fef0d57439fc。
分支：feat/ningbo-first-team-access；独立 worktree：C:/Users/Administrator/.codex/worktrees/ningbo-first-team-access/zhixu-ainuoke-api；起始 HEAD 同 main、工作树 clean。GitHub 是实时事实源，本文件是阶段快照。

## 用户决定和授权

用户要求：“先实施 feat/ningbo-first-team-access，先用合成账号完成六角色测试。保持现有 UI，测试通过后提交 PR 并做合并前审查。暂不修改真实账号、数据库或部署宁波及 18443/18444，不自动合并。”真实账号以后由用户用管理员创建，合成姓名/用户名/角色可由 AI 定义。本次功能授权涵盖既有用户权限页的建号、角色、停用、重置，不涵盖重设计。用户不提供密码。

此前用户确认：宁波 Ubuntu 已运行旧系统，需外网，域名 staging.weaveops.top；18443/18444 数据无迁移价值；全部登录团队可见已授权采集的艾诺科订单、物料和来源采购价，织序内部金额按角色。首轮采集使用用户本人账号；“能看全部合同”是用户陈述，尚未在宁波实测。本任务不调用艾诺科，不保存真实用户名/凭据到测试或代码。不导入18443/18444不代表已删除，也不决定宁波旧数据可删除。

## 实际实现

- 复用 app_users/app_roles/app_role_permissions/app_user_roles/app_sessions/operation_logs；无 SQL、schema、migration、初始化管理员或启动 seed 改动。
- GET/POST /api/v1/team-access 只接受 session Authority。GET 不写角色；POST 要求可信 user_permissions.view+manage、Origin、X-Zhixu-Request、有界 JSON，并在事务内重查 active 与当前 DB 权限。
- 仅显式建号/改角色插入缺失预设；已有预设权限不一致409，不静默覆盖。沿用 role-server-admin，不按姓名或 legacy role 提权。
- 创建 requestId UUID兼作 public_id；重复请求只核对结果，不改密码。用户名小写3–64位ASCII字母/数字/点/下划线/连字符，展示名可中文。
- 更新/重置要求SHA256版本令牌；同版本并发只允许一个成功。禁止自停用/自改角色、移除最后一个启用管理员；没有硬删除。
- 密码至少12字符、不超过72个UTF-8字节，沿用pgcrypto bcrypt cost12；更新和重置撤销全部会话。重置与登录共用账号advisory lock。事务审计只含姓名/账号/角色/状态，无密码/哈希。
- 显式Server Quote+session构建复用用户权限页；默认Browser与local-single-user限制保持。allowlist仅新增已有账号设置页，未开Order/Material/Production/Closing生产路由。
- 客户端不读写Browser permissionRepository，不自动重试未知写结果；身份/权限范围变化清空目录和密码草稿。初始管理员仍使用既有受控bootstrap，没有匿名注册。

## 首版六角色

这是用户接受建议后的首版矩阵；精确keys见server/auth/team-roles.ts，API按keys授权，不按角色名绕过。

| 角色 | 成本/Estimate | 销售价 | 确认工价 | 当前职责 |
| --- | --- | --- | --- | --- |
| 系统管理员 | 读写 | 读写 | 读写 | 全部现有权限、账号管理；未开模块仍不可用 |
| 管理者 | 只读 | 只读 | 只读 | 报价读取/导出/审计 |
| 报价经理 | 读写 | 读写 | 读写 | 报价/版本/确认/附件、主资料/制作方案、导出 |
| 物控经理 | 不可见 | 不可见 | 不可见 | 报价基础信息；Order/物料只读预授权 |
| 生产经理 | 不可见 | 不可见 | 只读权限 | 基础信息；排产写入未授权 |
| 财务经理 | 只读 | 只读 | 只读 | 报价读取/导出/审计；关账写入未授权 |

生产经理在成本受限的Quote视图不会显示工价；未来Order CCT可独立显示其授权工价。全部角色有ainuoke.view、order.view、style_progress.read/view_history；这是权限目录，**不是Source激活**。普通经理未授同步/import、订单编辑、排产或关账写入。

API可绑定多个预设取并集；UI显示旧组合，选择一个预设会替换全部绑定，暂不提供任意key编辑。目录上限1000账号，超过时明确报错，无静默截断。

合成API账号synthetic.team.0…5、UI账号synthetic.ui.0…5按表格顺序；另有synthetic.root/synthetic.ui.root作测试管理员。均在临时PostgreSQL tmpfs容器创建并随测试销毁，不进入真实系统。测试固定密码不作为真实密码建议。

## UI证据与验收边界

复用UserPermissionView、AppShell、MasterDetail、Card、Modal、qc-permission-*和qc-control。CSS、断点、报价/订单布局未改。Server局部交互：页面头部“恢复默认权限”替换为“新建账号”；详情“切换账号”替换为“重置密码”；角色/状态走Server、权限键只读；手机沿用既有Bottom Sheet。

本次用户功能授权记作V2，不把自动截图当成人工验收或D-099/PR64/P6新视觉基线。截图：evidence/ningbo-first-team-access/desktop-existing-layout、desktop-six-roles（1280×900），mobile-list/detail/reset（390×844）。production build真实RootLayout样式已检查；非截图像素黄金回归。

## 验证记录

第一轮：API 16/16 PASS；真实Chromium 5/5 PASS（六角色建号、刷新持久化、窄屏、角色/停用/重置、非管理员拒绝、无Browser权限存储）；typecheck、lint、默认Browser build PASS。
npm test首轮因新增设置allowlist尚未同步清单，正确阻断ROUTE_CAPABILITY_DRIFT；不放宽检查器，补清单后重跑。补并发测试后的最终结果、冻结证据commit、复审/远端状态在下方追加，不冒称当前全完成。

## 上线Gate和后续

本任务实现未部署，真实账号未创建，人工验收未做，Source未激活。未来宁波先核对候选镜像、独立空账本、HTTPS/Cookie/Origin、私密管理员bootstrap及回退，再由用户独立授权部署。密码由管理员私下配置；本版没有邀请邮件、忘记密码或强制首次改密，不声称已有。

AI建议下一PR：宁波候选只读预检与独立发布/回退方案；其后Linux受控Ainuoke采集和团队只读Source接线。待确认真实名单/启用日不阻塞合成测试。旧数据和环境不得共库或擅自清理。

更新时机：main/PR head、矩阵、UI范围、测试、Source/环境/人工验收变化。GitHub Issue #96登记需求，实际代码与测试优先。

## 最终本地工程与交付记录

代码checkpoint：72b025343c2e0d5f13f0652c04e37b5c5051a20e；typecheck/server:build/lint及默认Browser/显式Server build PASS；npm test 807/807 PASS；客户端/六角色API/既有Session与金额保护31/31 PASS；Chromium5/5 PASS（重复通过）。发布清单绑定新冻结证据，check:release-baseline PASS，10页面/9能力/6项UI文件。

[合并前本地复审](ningbo-first-team-access-review.md)：未发现P0/P1代码阻断，但不能在未送达/未跑CI时建议立即合并。main当前未强制required checks，建议另行配置。截图源码等同checkpoint，构建标签仍为提交前main；不是部署证据。

REMOTE DELIVERY：安全交付在checkpoint返回LOCAL_PASS_REMOTE_UNVERIFIED，pushes=0、NETWORK_DEGRADED；独立GitHub ref核查404。未创建PR，未运行远端CI。按既有网络协议不盲目重试；最终本地commit收口后由用户普通PowerShell执行一条恢复命令，核对exact SHA才创建唯一PR并检查CI。LOCAL ENGINEERING继续且真实环境完全未操作。

独立命令 npm run test:release-baseline：69/69 PASS（与807项中的对应测试重叠，不累加计数）。测试临时PostgreSQL容器清理完成；数据库目录、部署工作流和现有CSS无diff。

## 远端交付恢复（2026-10-12，取代上方待交付状态）

用户普通PowerShell回执仍为NETWORK_DEGRADED、pushes=0。用户要求由Codex自行推进后，先执行既有只读诊断：默认HTTPS、HTTP/1.1、OpenSSL+HTTP/1.1均读得main 01694d723cd7b65fcc20e3e79941fef0d57439fc，本机gh也PASS；未改TLS/代理/认证配置。随后主Codex通过自己的PowerShell调用同一受控交付脚本，单次push成功（5135ms），GitHub API独立确认206768e107bcd6402983f74adc9f002a5fbd757a：DELIVERED_VERIFIED、pushes=1、EXACT_HEAD_VERIFIED。不是用户再手动执行，不以此次成功推断永久恢复。

源码和测试结果不变；本段及接力/复审状态为文档更新。唯一PR和最终head CI继续在GitHub核实，实时PR结果优先于此快照。没有合并、部署、真实账号或DB操作。
