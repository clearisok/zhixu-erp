# 恢复点：Server人工到仓后台已登记，接续原页面与逐批物流

2026-10-21；root唯一writer，既有server_convergence_review只读。当前codex/server-material-arrival-plans，从独立main996dfedc12da3527343cd3ff2aa5eea35497e10e创建并明确ff-only接续干净bb0ee1768d4d97c26b60458248e305fe5a241a97，无继承dirty。[阶段任务](tasks/active/server-convergence-gate6d-material-arrivals-2026-10-21.md)、[后台契约](features/SERVER_MATERIAL_ARRIVALS.md)、[输入Git原文](tasks/completed/2026-10-21-material-arrival-inputs/bb0ee176/)、[冻结工程记录](tasks/completed/2026-10-21-material-arrivals-engineering.md)。源码checkpoint cbfd1e65595a05444e632b5bee9e0dec83c8e12b，当前最终HEAD/dirty以git核实。

0039/server/material-arrivals唯一owner；长期UUID完整变体排除qty/date/unit/events，数量变更稳定，多候选不猜。manual-only/partial/精确容量，Hub发生时ID/name/enabled/version及tracking版本冻结。Source交期不冒充到Hub；无自动来源批次/补齐/四流配对。改仓/单位/消失/厂供/超配留历史；单位先明确移除再重填。来源故障可清空已有计划，不可用旧证据新增。原SO/排单/执行/价格/关账不改。

reader提取PoolClient同事务准备，旧GET仍RR；profile→SO锁序与采集一致。构造时冻结private confirmations/元信息，函数内固定配置/指纹。两项复审P2（命令32KiB容量、私有确认冻结时点）已修；60000规范命令配64KiB库。DTO无金额/生产或仓备注。归一direct refs和完整命令指纹登记，不开放执行。

定向26/26 32717.1341ms、来源/安全45/45 47736.5341ms、引用/迁移55/55 37362.7995ms，类型/全lint通过。早期3契约/17初整合/24跟进升级、初type错误、首轮安全31/37旧共享CCT假设与修正时序保留。审查者只读复审无新阻断，未代跑测试/DB/网络。cbfd上完整项目927/927 232165.1055ms、发布116/116 230542.8865ms均0fail/cancel/skip；前端与顺序Node构建exit0，build20261021-183455；精确main守卫PASS11页/51能力/66累计UI路径/errors空。

工程报告440dda3958f6c2c61db08800b605abe92870bf26，独立复审时序更正6525963606f4ff285f3ab4800c5cd23996feab0d：类型/lint在相同源码冻结前执行，构建/完整回归/守卫在cbfd。首次元数据试用未锚定main的supersedes链被守卫拒绝，未提交；按现有规则只登记652最终报告为一个新根，440原文仍存Git，不放宽守卫。清单总247证据/52能力；旧246/51及其他字段不变，无UI/物流完成主张。最终HEAD/dirty与登记后精确守卫以Git/outputs终态核实，不用应用hash冒称元数据HEAD。

下一独立阶段从原页面接线人工到仓批次、请求恢复与逐批唯一物流服务；先读本后台契约、原Style Progress及唯一算法和D054/065–069，不新建导航或第二套物流。Source-following无地点证明不开放，旧PNG不覆盖。完整Server收敛/正式成衣Source/关账及用户验收仍待，Goal不complete。
Git664f非零push具体原因未知，STOP仍在，不盲重推/换认证；只读main不证明写恢复。无新PR/Hosted CI/合并/关闭/部署，保护旧环境/真实Source额度。D152 Num/outdate已确认，Goal active，完整Server收敛未完成。
