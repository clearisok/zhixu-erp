# PR178 Staging集成执行

用户在2026-11-27本聊天明确授权必要修复、只合并178、部署Staging并只读验收；不操作Production、其他PR、业务库/数据库结构、Worker调度、清理、备份保留、服务器网络。保全失败或备份恢复门禁失败停止相关操作。新授权见[原修复任务](order-workbench-staging-2026-11-27.md)。

独立工作树 codex/pr178-staging-integration 起点 36ce6565c414270552e288584423e8db1191c622 clean。当前预整合受审178与已运行Staging 220ec86cb6cfa695c83ea474247bb01150075131，main基线10b9a7d827e1c09f152ead58c21f26712d49a619；178仍等待最终CI，尚未合并或部署。此候选不能宣称实际main集成；CI全绿后仅正常merge178到main，再把实际main合并SHA正常merge至本分支，核对实际基线/来源并完成发布守卫。NETWORK_DEGRADED，仅本地checkpoint，不重复push失败通道或假称GitHub已交付。

保全：以两个完整祖先正常合并，仅两处UI重叠人工组合，保留Staging物料读取错误反馈/只读重新读取、历史起点/历史缺口与recordKind；保留178摘要/紧凑历史入口。自动合并订单挂载/已有测试，域API、0061–0067、权限、备份/Worker/ops脚本精确保持220字节；不改变176/172/173分支。717条冻结记录完整并集，旧hash/ID不改，能力/验收状态不借集成升级。实际main前向证据收口后才最终guard。

Staging只读实况：220/build staging-i174-220ec86c、app c0d84053…、Worker4d16d738…运行，正式配置/data/issue174-phase3-20261126b，原DB/对象/卷不变。6233数量54000、三色23000/17000/14000、交期2027-01-13，来源stale保留16自购/15采购记录/12入库记录，完成16项未知无百分比。

旧配对备份20261127T151646Z-2658b2bc、manifest SHA256 bb0e23d68fe8c33a4a234aab52c086d45bb06019c674293e41cd3259af1a3d01：57文件111724319字节哈希一致，147表/13附件，cleanup正向及原服务恢复。独立临时数据库恢复完整行/序列/附件引用验证ORIGINAL_RESTORE_VERIFIED，原服务和业务库不动。原crontab SHA256 c71caad3ddc46bf13a725ddd15e53b82345208ead6deb044e13dca3559716f82。

待完成：工程/隔离UI/最终CI/main合并/实际main集成/新版本与原Worker配对发布策略/正式发布前新备份及恢复门禁/只读验收。不得预写PASS。
