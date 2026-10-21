# 恢复点：当前Server候选持久化演练

2026-10-22；chore/server-candidate-persistence-rehearsal，独立main 996dfedc12da3527343cd3ff2aa5eea35497e10e后FF干净f4692eea92556ca02fcc068c03940fd2982a4d10，无继承dirty。root唯一writer，既有reviewer只读。旧三摘要精确归档tasks/completed/2026-10-22-candidate-persistence-inputs/f4692eea；[本阶段](tasks/active/server-candidate-persistence-rehearsal-2026-10-22.md)与[冻结报告](tasks/completed/2026-10-22-current-server-persistence-engineering.md)提供范围。

干净f469的新镜像zhixu-persistent-local:f4692eea-20261022（ID ee7095b4d404c2bd2a1b62402e941f21cff86266817f4e2168d467dccf837f1d）已实际验收。40迁移/最大0041；首轮7/7后补测试清理prepared保护，修正后8/8、适用运维22/22及语法/lint通过。只改演练helper与文档；应用/SQL/UI不变。旧f0c硬编码镜像测试首步缺镜像失败、0创建，未冒报通过。最终source checkpoint、前向证据、发布及exact HEAD/clean/guard必须读ignored outputs/current-image-persistence/checkpoint-final.json，不存在或非PASS不得预报。旧18/81/269/927结果属于前阶段，未重跑。

Git写仍停止：旧a296工具exit1/STOP_AUTH_OR_DIVERGENCE，独立API exact且三CI success，根因未明。不要因成功读取或exact而盲重推；无新PR/Hosted CI，禁止merge/close/deploy。main再次独立重读仍996。新Phase输出只在ignored目录，原冻结报告/证据和旧运行态不改。

原3001/50426/59069/62426 PID不变；62426仍8175旧Gate1镜像，不是当前f469体验入口。所有旧端口/卷/账号/Browser/工作树保护；0新真实Source/凭据或候选读取/业务库操作。Num/outdate已确认，不重问；C1/C0/C1额度与三项关账待决不默认。Goal仍active，下一步是最终门禁及候选依赖/切换条件，不能局部PASS就complete。
