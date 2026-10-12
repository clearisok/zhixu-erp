# 首批团队工程证据（冻结记录）

核实日期：2026-10-12；main：01694d723cd7b65fcc20e3e79941fef0d57439fc。冻结后不可覆盖；后续结果写任务文档或新增证据文件。

已确认：session账号目录/命令、六预设与原用户权限页接线已实现。代码为server/auth/team-access.ts、team-access-routes.ts、team-roles.ts、features/permissions/components/server-user-permission-page.tsx及server/team-access-client.ts（后者位于features/permissions/server/）。
类型检查、Server TypeScript编译、lint通过。默认Browser build与显式Server/session build均成功，只有既有bundle大小/插件耗时警告。
2026-10-12合成组合测试31/31 PASS：客户端4、六角色/账号API17、既有Session与金额保护10。命令与脚本见package.json test:team-access及新增CI。真实Chromium首轮5/5 PASS；最终重复结果写任务文档。
API覆盖匿名/CSRF/伪造权限、六角色金额/创建、重复/冲突请求、弱/超长密码、CAS并发、停用/改角色/重置会话撤销、自锁/最后管理员、权限撤回、角色漂移、local-single-user拒绝。未修改测试期待来掩盖真实权限失败；首轮共享金额测试副作用已隔离。
UI复用MasterDetail/Modal、现有CSS；测试建六号、刷新、窄屏无溢出、停用/改角色/重置、非管理员拒绝、密码不落存储。截图是合成工程证据，未获新人工验收；不是批准的像素黄金基线。

状态维度：implemented=yes；merged=false（本记录产生时）；isolatedTest=passed-historical；humanAcceptance=not-run；sourceActivation=not-applicable（账号模块本身，不代表Ainuoke接通）；18443/18444=not-deployed；宁波=not-deployed。
用户决定：六角色、合成测试、保持UI、后续自行创建真实账号；Ainuoke已授权来源团队共享，织序金额按角色。来源账号覆盖仍未实测。
无新SQL/migration、真实账号、真实DB、SSH或部署操作。临时PG容器采用随机名/loopback端口/tmpfs，测试自建自销毁。CI仅ubuntu-latest托管runner，不使用weaveops-prod，不触发Deploy Production。
AI建议：通过完整门禁与复审后可评估合并，但上线仍须宁波独立候选/账本/回退和用户授权。未验证：真实Source、真实账号、宁波环境/HTTPS/Cookie、用户人工验收。

更新时机：本文件冻结；新实现/新测试/部署/验收须新证据，不改旧结论。发布清单recordedAtSha绑定保存本文件的commit，render source依Git记录可追溯。
