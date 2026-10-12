# 当前状态
核实2026-10-12；GitHub main：3456fe5fc6e213c2e896e4e6a509e28751f1798c（PR101 已合并）。GitHub 是实时事实源；随 main/PR/测试/验收/环境变化更新。

- 用户确认“登录页可以”，PR101 已按授权合并；只确认登录视觉，未扩大为全业务人工验收。
- PR100 在原独立工作树整合最新 main，保留原 P6 订单/物料与正式 /login，默认 Server orderRead/Source 仍关闭；当前做同一本机合成演示，不合并 PR100。
- 一套临时 loopback PostgreSQL、六个 demo.* 合成角色、一套 session；每60秒合成快照，页面30秒读取。真实账号、数据库、宁波与18443/18444不变。
- 当前组合测试结果见[统一演示](tasks/active/unified-local-demo.md)。历史 PR100 root809/PG261/P6 UI8、PR101 登录UI10/六角色UI5已通过；组合测试尚在执行，不提前宣称通过。
- D105保持：真实四流持续按订单展示后才上线宁波。安全通道/私密凭据/首次真实绑定/连续运行/完整镜像/备份恢复/人工验收仍待授权Gate。新增合同和主信息/颜色增量未实现。
- Quote扩展UI在旧main与PR101均69/78、8个相同失败+父测试失败，原因未解决；这是历史对照，不声明全项目全绿。PR98仍需对齐D105后再考虑。

详细功能：[来源](features/AINUOKE_SERVER_SOURCE.md)、[登录](features/SERVER_LOGIN.md)、D106/D107；历史冻结证据不覆盖。
