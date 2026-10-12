# 已批准 HTTP 的艾诺科接入

核实2026-10-13；main 6395db45bebe572c736cf4137a373e0f816be6c0。分支 feat/ainuoke-approved-http；起始9ebdf3b46b471e227e86a86c36f705e7ac6e6908、clean，PR98合并后已快进同步。随代码、main、CI、真实探测和验收变化更新；GitHub为实时工程事实源。

## 用户决定

永久接受现有艾诺科 http://61.164.81.194:9043 的HTTP风险，直接推进；保持UI、不修改真实账号或DB、不部署。D109仅替代原HTTPS/安全隧道前置，不追加到期/重复批准。用户授权PR98修复后CI通过合并，本HTTP工程另行PR，不自动合并。

## 已实现与验证范围

- Node配置和Python worker均校验原origin与transportPolicy=user-approved-http-d109。无标记、改IP/端口/路径/用户信息/未知字段等拒绝。原HTTPS/loopback路径继续保留；重定向、ambient proxy及TLS保护不变。
- 持久操作仍用Linux私密文件、现有RBAC/DB目标校验。新Windows普通终端只读probe可隐藏输入密码、不落盘，不复用Credential Manager；非TTY与无法隐藏输入时拒绝。
- 密码只通过匿名stdin交给短命子进程，90秒总限、一次登录、6086103/6087105/6087050固定首页，无重试/翻页/DB写入；输出闭集状态和计数，不输出合同、材料明细或秘密。
- 保持UI、SQL、默认路由和调度开关；未执行首次绑定、采集发布或真实服务变更。
- 工程测试与复审：[engineering.md](evidence/ainuoke-approved-http/engineering.md)；用户执行回执：[user-probe.json](evidence/ainuoke-approved-http/user-probe.json)。

## 真实探测事实及限制

2026-10-13用户在其PowerShell私下输入凭据后回传JSON。认证成功；订单Discovery首页50条，总数558；首个可见合同颜色5/5、物料0/0。这是用户执行证据，未由助手重复真实登录。用户名/密码/合同标识不收入回执。

complete=true只指本次请求的该合同报表分页完整，不代表全合同；首合同物料0不能说明其他合同无四流。558是上游当次声明总数，尚未完整翻页验证，不等同于最终去重后可绑定订单数。Source仍未激活、织序操作人授权未检查、业务语义未验收。

## PR98交付事实

原head f1f67f7经普通merge对齐9ebdf3b，解决4冲突、D105/0012上线方案与26相对链接。已送达99ff6967ace46480c045dc99e7e06c7bc6fed77b的三项CI成功后，于2026-10-12T16:08:41Z合并为当前main（北京时间2026-10-13）。

CI：[source](https://github.com/clearisok/zhixu-erp/actions/runs/38273698164)、[team-access](https://github.com/clearisok/zhixu-erp/actions/runs/38273698281)、[baseline](https://github.com/clearisok/zhixu-erp/actions/runs/38273698193)。原现场报告/observations.json未改。最后本地174a7e5c27b2b5f5ee18227c6625c0746d9fe82a只含状态证据绑定，工具网络预检失败pushes=0，未纳入PR98合并；其语义由本HTTP分支接续，原提交保留。

## 下一步与回退

1. 只读完整翻页/去重/数量核对，选择实际有采购、入库、出运、出库数据的代表合同，核对字段、单位、缺失与更新行为；不需要再次接受同一HTTP风险。
2. 确认完整范围及限额以后准备具体空账本首绑预览和调度计划，列出目标指纹、权限、恢复点；未获数据库执行授权前不绑定、不启动持续写入。
3. 完成真实连续运行及原页面人工验收，再按[宁波方案](../../ops/ningbo-rollout-plan.md)准备独立候选和上线授权。新增合同自动建单/主信息颜色增量仍是独立缺口。

本轮回退仅停止只读探测/撤回代码分支，无真实数据需回滚。未来禁用采集保留历史，不以删库或删除订单回退。AI建议的连续24小时、每类3张代表单等仍是建议，需结合真实来源频率核实。
