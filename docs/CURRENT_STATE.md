# 当前：Issue159获批Staging候选部署，备份门禁待完成

2026-11-20；feat/ainuoke-source-deleted；main基线636a5ad0d2d1acbe6b2705696e782dea12ee9f00；实际候选6178e666bf45e80cf51cd9962521e264d3a97385，三CI全成功，PR160 Draft/未合并。用户当前聊天已明确批准Staging部署，未授权合并/Production。

64份回滚资产及原四卷/DB/objects保全；离线app d5aa1242、operator d40600b3构建和正式Compose/trial check PASS；0060兼容旧app0d5fd0bf在隔离PG完整迁移账本校验通过。新runtime catalog-sync-6178e666已准备但未装cron/未部署。

真实旧版636a目前因selected_source_invalid暂停、Worker0、142failed/20queued/0running/0unknown；保留故障，不SQL清暂停/补任务。首次预备份054906Z-7df3bfd9在snapshot300秒超时，旧服务恢复，失败/清理证据保存；只做一次无构建负载复验055650Z-f633997c，尚未通过，不得切版。旧app回滚兼容0060只增加清单，旧Worker不得自动连接。

下一步：先读主机/home/jackson/weaveops-staging-preview/releases/source-deleted-20261120与weaveops-trial-backups真实状态，核实复验终态；备份成功且独立hash/cleanup验证后才能正式0060/三个无状态容器发布/匹配policy/cron/版本和卷保全核验。若再次失败，不再盲重试，不绕备份。新完整目录转换与真实页面验收仍未发生。内置浏览器kernel assets启动失败，不冒称UI验收。

工程1026/182/106、PG10/10、合成Chrome四桌面/两角色及质量/build已通过，不能代替真实Staging部署验收。[完整阶段证据](tasks/active/ainuoke-source-deleted-2026-11-20.md)。NETWORK_DEGRADED的原代理/宁波失败历史保留；本Gate先本地checkpoint，最终用既有已验证进程级正式工具做独立送达核实。

Gate B：第二次原300秒备份也失败；相同完整只读快照实测313.626秒（不是备份成功）。必要最小修正仅增加policy.snapshotTimeoutSeconds，默认300、严格int 300–600，本次Staging450；SQL/哈希/表数/恢复门禁不变。Windows24通过/1 POSIX跳过、SDK211通过，Linux与新CI待核。此后候选SHA须更新全部组件/Policy身份；原6178镜像尚未部署，不能再冒作最终部署候选。详见任务证据，仍禁止越过正式新备份。
