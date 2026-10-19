# Source CI 精确迁移样本查漏

2026-10-15核实main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；feat/order-effective-attribution本阶段从98d2a0e5a35d3ab27bf625d7667bfefd293548dc/clean继续，仅测试与状态文档增量，无产品/迁移/真实数据变化。GitHub是实时工程源，随CI/main/迁移集变化更新。

G1 PR109初始精确def98f Source CI失败：ainuoke-server-source.integration.test.ts写死schema_migrations总数12，实际增加0014后13；旧升级fixture只排除0012，反而误带入后续迁移。原门禁/分组测试未覆盖此独立Source套件，不能把全PG通过当作所有Source CI通过。

G1修复准备中；当前后续分支旧fixture筛选<=11已存在，但升级后精确versions列表遗漏0023。现明确断言旧库版本1–11，最终1–12、14–23（13未发布/文件不存在不虚构），保留原账号public_id/password_hash原值核对。不是把断言改成动态任意数量或跳过升级。

本分支test:ainuoke-server-source exit0：21总数，20PASS、1个Linux CLI子场景在Windows按既有平台条件SKIP；实际Python fixed-catalog loopback已运行，其余失败/分页/撤权/重复/漂移/持久化腐败/原子发布测试通过。Linux场景仍需Hosted CI，不冒称本机已验证Linux。未重读真实艾诺科，无Source激活或真实DB写入。

本阶段不修改已冻结b63d6424/f96ce65c准备UI报告/图像或其哈希，也不重复运行已通过的无关UI。G1 PR109三项最终CI与新修复head另外核对，本G4分支远端交付仍待，整个Goal未完成。

## fresh-start同类断言（从7c01e049/clean）

PR109第二轮独立Source及Linux步骤通过，在fresh-start旧12/最后0012/rerun12断言失败。当前后续分支同样保留旧期望，已改显式1–12、14–23并逐版本核实实际应用与ledger、最后0023及重复启动。明确仅四项技术初始化单例各1：normalization_target、attribution_write_epoch、command_control及初始control_event；除此与schema以外所有业务表仍0，启动后只增加既有技术管理员权限白名单。额外核实epoch0、mode enabled/version1及初始事件，双重启动不改技术行原字节；不把enabled解释为Source激活或实际归一许可。

本机fresh-start7/7、完整类型通过。该白名单来自0019/0020/0021实际SQL，不动态允许任意新表或业务seed。没有修改SQL、默认配置或真实初始化，原UI冻结证据不改。PR109最后修复a40cb7de382146748e18f7e8b8ea3acd9108c96a已自行精确送达，最终CI仍在运行；本G4分支尚未交付。

2026-10-15七角色测试恢复：从482f0118及唯一已知dirty继续，测试blob f8b7cea063d1ed01e5ffe54bb3e94cabc31cc83d与G1已提交1fcc440完全相同，本分支5/5通过（精确七角色、逐账号绑定、全部非管理员拒绝及移动端管理），不改产品权限/SQL/UI。此前收口启动被自动审批服务连接错误挡住，未执行；本次仍走同一审批检查。PR109的1fcc恢复交付选择待用户，不自动推送/合并/部署。合成哈希碰撞新发现保存在原7bf3工作树被Git忽略的outputs/2026-10-15-g5-readonly-discoveries.md，尚未修复，不能冒称真实数据已受影响。
