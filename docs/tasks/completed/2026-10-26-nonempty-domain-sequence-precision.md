# 非空恢复证明补充：序列精度与断言范围

2026-10-26，前向独立补充；原[非空恢复证明](2026-10-26-nonempty-domain-recovery-validation.md)及其505清单记录保持原字节，不将原branch-only根伪造为main锚点或覆盖历史。

## 原报告的精确解释

- e3a23280e152d4113366604da020c68eb3e519bb test source＋原6d镜像的9/9、478994ms确实通过，47表实际非空、7领域读取和13个known原回执有效。原全表计数/摘要比较也有效。原pg_sequences经过JSON.parse，max_value等大整数元数据被舍入；当时last_value均为安全小整数或null。因此原记录只能证明当时JSON数值投影相等，不能称所有64位序列字段逐字无损。
- 原“到仓60.25等decimal由测试显式断言”精确限定为：计划100与完成20.25有直接数值断言；60.25为到仓提交输入，参与原POST/恢复回执及数据库一致性比较，不另冒称有输入到存储值的直接等号断言。

## 最小修复与新实际证据

- 新test source 12477a1fa58f1cff0182974e0894671585a4824f，parent 1687ca0e323217a337fd65553daac522aa712f8c。唯一既有helper行为差异：取消pg_sequences原SQL结果外的JSON.parse，保留PostgreSQL有序::text字符串；SQL/排序/调用位置、全表digest、完整恢复harness及产品/DB/镜像均不变。诊断和冻结消费者只序列化/比较该字段，不要求其为数组。
- 新回归直接调用snapshotPersistentDomainDatabase的includeTechnical分支。非序列表统计明确为占位mock，不是新的非空恢复证明。覆盖相同状态，last_value相邻9007199254740992/9007199254740993，以及max_value/步长/cycle不同；不同值必须触发AssertionError。先红1项（实际object、要求string），没有启动PG；该回执为工具输出摘要，非伪造原始日志。
- 同一次修后验收使用一个全新自有disposable PostgreSQL；实际执行同一pg_sequences SQL，保留9223372036854775807与上述高位last_value原文；独立连接读取last_value::text确认原值，相同状态相等、高位相邻值不同。该临时库只验证比较表示，不是第二个备份/恢复入口。成功后仅清理新自有PG；失败路径保留现场。
- Canonical 2993 tracked blobs/0 overlay；新实际2/2、2841ms，0fail/cancel/skip/timeout/overflow，语法和定向lint通过。没有重跑未变的480秒整轮9项，也不把原9项写成新source重新运行。全部图像/业务/API/SQL不变，不构建、不安装、不发CI。
- 旧50容器/179卷/27网络所选元数据再次changes=[]。原1687ca0e323217a337fd65553daac522aa712f8c守卫PASS129601ms只归原head；最终Q/R精确守卫和独立复审另按真实回执。

## 边界

本补充不证明完整43迁移所有业务域非空恢复，0040–0044原限制保持；没有真实Source/账号/业务库、Browser、50426切换或部署操作。PR130远端仍61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，原CI3/3不归本地新源码。Git/ref远端写仍STOP_AUTH_OR_DIVERGENCE，根因未定；完整G1–G8/R与关账三项待决、来源激活/人工接受/退役边界不变。

## 本机原件SHA256

sequence-red.json：cc539e373d793b9a47ff8f61fce508cb3f00ad0b7695b6bde77adccd5145bf34

sequence-source-checkpoint.json：2432cf344f0b93d9291d4a46ff5af0398ddc6ea501450052d19515cdc75998e8

sequence-qa-attempt.json：02bf1eb76eef3cfdf7d2e7aedd33895dd419d317bb383c01a172c8b27eed6184

sequence-qa-result.json：d6588686f2339877cce93eee1daa0599c9f8efb0f46b57d0cc9b98fd56d8b553

sequence-qa.log：27ebc22a07cc7ee8afb8e358d97f1b0cdcc0a40f78ad35e5a7e0d7a59b67096f

preservation-sequence.json：05560a79e681e3b52cc9d690d20a36268b466e6d4c06d6adee634004709263ec

guard.json：7414d23beb9838f6f8f364639ce5552bda7a0b93bd09d6510f2da71290410582

原件在outputs/domain-recovery-20261026；不上传raw日志/合成业务快照/凭据。[当前阶段](../active/nonempty-domain-recovery-2026-10-26.md)。
