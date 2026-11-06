# 当前状态：单次登录已恢复，历史拒绝根因仍未证实

2026-11-06；分支feat/ainuoke-full-catalog-followup；main只读核实cb5cc29baa49ed7115fdb6c9506b6a80356936ea。当前阶段补齐采集器登录诊断，无认证方式/调度/业务行为改变。

用户批准的唯一宁波登录在14:53:13完成：HTTP200、305ms、1登录/0报表、无重试、isCoverLogin=false。配置与此前冻结值一致，镜像原06d56d10，未发现运行中的采集进程；旧worker仍PAUSED。没有上游拒绝响应，因此只能称“当前恢复但根因未明”，不能宣称密码/会话问题已经修复。

共用封闭登录分类器已接入实际采集trace和单次诊断；HTTP状态及畸形响应分类完整保留，TypeScript校验旧/新内部回执，业务API摘要不变，无迁移或新权限。新增说明不再暗示密码错误。

608成功历史和240/243第二轮不变，剩余3张未采；staging最新5af85cd6（性能/登录分支），仍3张正式订单、同步暂停。本次不升级staging、不恢复同步、不补采、不修改账号或业务库。此前PR140 b338三CI成功仅为原版本，本轮交付另记。

[本次诊断与边界](tasks/active/ainuoke-login-diagnosis-2026-11-06.md)；[真实回执](../artifacts/ainuoke-login-diagnosis-20261106/result.json)；[原恢复点](tasks/completed/2026-11-06-before-login-evidence/AI_HANDOFF.md)。

本地187项Python、5项诊断存储/兼容检查、类型、受影响TS lint及服务端编译通过；宁波镜像内25项离线诊断通过。首次Python假响应缺status引发1错，改为可选状态并全量187通过；首次源码门禁两项文档问题已修，发布回归和最终门禁仍待结果。复审为主执行者逐项检查，不冒称独立代理复审。未触发新CI。
