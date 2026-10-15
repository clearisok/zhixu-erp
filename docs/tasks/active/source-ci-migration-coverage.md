# Source CI 精确迁移样本查漏

2026-10-15核实main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；feat/order-effective-attribution本阶段从98d2a0e5a35d3ab27bf625d7667bfefd293548dc/clean继续，仅测试与状态文档增量，无产品/迁移/真实数据变化。GitHub是实时工程源，随CI/main/迁移集变化更新。

G1 PR109初始精确def98f Source CI失败：ainuoke-server-source.integration.test.ts写死schema_migrations总数12，实际增加0014后13；旧升级fixture只排除0012，反而误带入后续迁移。原门禁/分组测试未覆盖此独立Source套件，不能把全PG通过当作所有Source CI通过。

G1修复准备中；当前后续分支旧fixture筛选<=11已存在，但升级后精确versions列表遗漏0023。现明确断言旧库版本1–11，最终1–12、14–23（13未发布/文件不存在不虚构），保留原账号public_id/password_hash原值核对。不是把断言改成动态任意数量或跳过升级。

本分支test:ainuoke-server-source exit0：21总数，20PASS、1个Linux CLI子场景在Windows按既有平台条件SKIP；实际Python fixed-catalog loopback已运行，其余失败/分页/撤权/重复/漂移/持久化腐败/原子发布测试通过。Linux场景仍需Hosted CI，不冒称本机已验证Linux。未重读真实艾诺科，无Source激活或真实DB写入。

本阶段不修改已冻结b63d6424/f96ce65c准备UI报告/图像或其哈希，也不重复运行已通过的无关UI。G1 PR109三项最终CI与新修复head另外核对，本G4分支远端交付仍待，整个Goal未完成。
