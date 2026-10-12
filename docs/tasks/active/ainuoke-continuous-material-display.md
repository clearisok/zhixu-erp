# 首次绑定、持续采集及现有页面接线
核实日期：2026-10-12；main：db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e。
GitHub 是实时事实源；本文随 checkpoint、测试、PR、来源/运行事实变化更新。

## 用户授权
合并 PR99；从最新 main 独立 worktree，首次订单绑定、持续调度、现有页面接线；合成测试后提交 PR 并复审。保持 UI；不改真实账号、数据库，不部署宁波/18443/18444，不自动合并新 PR。真实凭据未来私下配置。
PR98 仅询问可否合并，本任务不合并它。

## 已确认基线
PR99 head 213fb2524bb5f8a2806fea0427a0d3a865612360，source/team-access/baseline 三项 SUCCESS；2026-10-12T09:27:54Z 合并，merge SHA db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e。GitHub main 与 fetch origin/main 同 SHA。
分支 feat/ainuoke-continuous-material-display；独立工作树起始 clean，无继承 dirty。原工作树保持。

## G1 来源编排
- 完整 Discovery + 正式 6087105 颜色来源；现有 Preview mapper 和订单事务/编号复用。缺/异常颜色保留主订单，缺数量不当零。
- --check 不访问来源或写 DB；--preview-bind 只读来源；--bind 双目标/预览指纹确认，再次采集核对，整批事务/可信权限/日志。
- 首次空订单账本或相同绑定集合的幂等重试；已有异源、部分旧账本拒绝。无旧库导入。
- scheduler 显式命令启动；串行、指数退避、恢复归零、错误凭据/权限撤销停止。只采集已绑定订单，不自动追加新合同或改订单业务事实。
- 默认 API 启动不启动调度；无新 migration；历史 0001–0012 保持。

合成验证：新增 23/23；既有来源 20 PASS / 1 Linux-only 未在 Windows 跑；旧 bootstrap 18/18；Python54/54；typecheck/server build PASS。仅 disposable PG，没有真实 Source/账号/数据库操作。页面和完整门禁仍在 G2，不能视作最终交付。

## PR98 复审
现场观察日期/hash 有效，保留原证据。当前 ops 方案仍称 Source 不阻塞 Quote-first、建议立即做候选发布，和 D105 冲突；schema 清单到0011且共享状态早于PR99。建议先合入最新main并前向修订方案/基线，重跑门禁，再合并；不原样合并，不删除现场历史。

## 未验证
真实可见合同范围、安全来源通道/速率、24小时持续运行、人工 UI/业务验收、候选环境部署均未完成。代码可执行不等于这些 Gate 已通过。

## G2 既有页面与复审修正
显式snapshot候选仅三条已存在只读页面，默认disabled；原P6/CSS/断点保持，旧入口禁用且Server缺UUID不落入Browser。每30秒及focus读取，用户/权限/订单scope变更清除旧响应。
新回归28 PASS+Linux1待CI；P6实际build/private Chromium 8/8（1440/1280/390、六角色、自动下一代、失败/过期/恢复、Browser无写）。新增CLI已实际经Python固定catalog，本机Windows不宣称Linux private-file命令通过。
复审修正：只有绑定审计receipt+相同reviewHash/集合允许重试；事务内重查freshness、5秒锁等待。首次截图发现11月1日显示10月31日，修复SQL DATE字符串读回，Shanghai/UTC/LA列表/详情/颜色测试均通过。原DB日期未修改。后续最终截图将从提交后的代码重建，不使用带未提交修改的临时图作为精确SHA证据。

## G3 最终合成证据
渲染代码e4d9737a048474d15d2f25d9e84dae327ac103c5；完整证据与9张截图见[evidence](evidence/ainuoke-continuous-material-display/engineering.md)。最终浏览器8/8、新增29PASS+Linux1待CI、原来源20PASS+Linux1待CI、PG261/261、Python54/54。G2误用scope导致loading已修复并重跑；CDP跨导航空DOM等待已修正。Docker runtime仍下载中；门禁与CI待独立核实。PR98当前CONFLICTING/DIRTY（2026-10-12），未经授权不合并。
