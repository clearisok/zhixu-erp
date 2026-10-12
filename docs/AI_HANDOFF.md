# AI handoff

当前任务chore/ningbo-readonly-preflight（2026-10-12）；main基线5215ef75510e4b55ef69b1ae1508816b80fda110；独立worktree ningbo-readonly-preflight/zhixu-ainuoke-api，起始clean。
用户明确授权合并PR97及宁波只读预检/上线方案；禁止修改真实账号、DB或部署。PR97已合并；新文档PR不自动合并。
当前恢复点：[预检报告](tasks/completed/2026-10-12-ningbo-readonly-preflight.md)、[上线方案](ops/ningbo-rollout-plan.md)、[脱敏证据](tasks/active/evidence/ningbo-readonly-preflight/observations.json)。
宁波两个旧运行版本/独立DB均健康；Server无账号且缺0008–0011；公网403/502、origin未知，真实发布NO-GO。没有执行startup/migrate/bootstrap或其他写入；旧备份成功不等于恢复验证。
下一工程PR建议chore/ningbo-release-candidate，只做独立候选配置和合成演练；先核查Cloudflare入口，随后另行授权真实初始化/账号/部署。现有UI、金额权限和Quote-first路由边界保持，密码不上聊天/仓库。
本阶段工程为文档与能力快照更新：先冻结现场/合并证据commit，再绑定清单与运行门禁；LOCAL ENGINEERING与REMOTE DELIVERY分别记录，最终远端head/CI以GitHub为准。
旧恢复点完整保留在[归档](tasks/completed/2026-10-12-ningbo-preflight-predecessor-state.md)。真实姓名列表由管理员后续自行建立；不再重复请求已经确定的角色或业务边界。

LOCAL ENGINEERING：现场/合并证据checkpoint 033a8a055ad6970912d29bcf06ef092c9890522d；check:release-baseline PASS（10页面、9能力、0 UI改动），专项69/69 PASS；七个已部署migration与main Git blob校验和一致，文档链接有效，git diff --check PASS。复审未发现文档/状态变更阻断；真实发布仍NO-GO。仅文档与快照，不重复声称本地重新跑了业务/DB/浏览器测试；远端PR将由现有CI再次验证。
