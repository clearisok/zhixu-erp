# AI handoff

当前任务feat/ningbo-first-team-access（2026-10-12），main基线01694d723cd7b65fcc20e3e79941fef0d57439fc；独立worktree ningbo-first-team-access/zhixu-ainuoke-api，起始clean。
用户授权合成六角色、保持现有UI、测试/PR/复审；禁止真实账号/DB/宁波及18443/18444部署、自动merge。
实现及结果见[任务证据](tasks/active/ningbo-first-team-access.md)、[权限](features/PERMISSIONS.md)、D-104；Source和Order生产入口仍未激活。
当前接力：72b025343c2e0d5f13f0652c04e37b5c5051a20e为代码checkpoint；807+31+5测试PASS，冻结证据与release guard已PASS。交付pushes=0、NETWORK_DEGRADED，GitHub ref404。收最终本地commit后等待普通PowerShell恢复的exact SHA，再创建唯一PR并查CI；不盲重推。
用户负责未来真实账号和首轮Ainuoke凭据；密码不在聊天/仓库交付，当前只用合成临时数据库。
旧状态日期/hash/结果/限制见[前序快照](tasks/completed/2026-10-12-first-team-predecessor-state.md)。更新于checkpoint、main/PR/测试/阻塞变化，不循环写自身SHA。
