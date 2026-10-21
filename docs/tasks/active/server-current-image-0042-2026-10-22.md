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
