# 当前Server镜像的独立持久化验收

2026-10-22，chore/server-current-image-0042；干净输入105cfbfcb336c0c29efe583f9ff09fda52bc07f0，
main再次独立核实996dfedc12da3527343cd3ff2aa5eea35497e10e。root唯一writer，既有reviewer只读。
只复用既有Dockerfile、ops和actual-image测试，不改应用、schema、业务或UI。

旧f469候选仅含40个迁移/最大0041；当前代码含0042，不能沿用旧镜像证明当前版本。
从输入精确Git archive单独构建新标签镜像，使用既有Server/session/writable/snapshot参数和
build-only USTC选项，保留TLS/signature，不改共享网络、认证、Docker daemon或系统信任。

仅运行既有persistent-local-trial.integration.test.mjs，使用其新随机合成project/DB/对象/
secret volumes与非旧入口的loopback端口。六阶段检查新空库显式init、S3/TLS、合成报价/PNG、
重启/冷重建、精确目标备份和另一空项目恢复；只清理本次成功prepare的自有fixture。
失败保留自身现场，不能停止或删除未prepare/外部项目。没有真实Source或账号/业务库操作。

开始时105cfbfc已通过精确守卫及原工具一次push/零push只读送达核对；初次STOP回执保留。
新source39689481386、team39689484921、release39689490085均attempt1执行中；不重发/重复dispatch。
当前仅验证引用，不新建重复累计PR，不合并/关闭/部署/切换50426或62426。
3001及全部旧端口、卷、账号、Browser、工作树保持。完整Goal仍active，原待答不默认。

## 实际工程结果

镜像从精确105cfbfc Git archive一次构建并核实标签；image ID
sha256:646acc4a19b19209009e3b230a107c8ea1bf4ece2fe3a1c2ab7d5ff283578071，
build server-candidate-105cfbfc-20261022，2026-10-21T22:53:53Z。
原actual-image测试一次8/8通过（317334.7113ms，无skip），41迁移/最大0042。
只清理自身成功prepare的合成项目和自身备份，未操作旧入口；候选image保留，不是新运行环境。
详细六阶段、精确作用域和未重跑范围见[工程报告](../completed/2026-10-22-current-0042-image-persistence-engineering.md)。
无应用/SQL/ops/测试/UI变更。待冻结报告/新证据、独立复审、最终精确守卫及交付/发布CI；
不把parent105的CI当本阶段文档CI。
