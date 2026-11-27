# PR178 Staging集成执行

用户在2026-11-27本聊天明确授权必要修复、只合并178、部署Staging并只读验收；不操作Production、其他PR、业务库/数据库结构、Worker调度、清理、备份保留、服务器网络。保全失败或备份恢复门禁失败停止相关操作。新授权见[原修复任务](order-workbench-staging-2026-11-27.md)。

独立工作树 codex/pr178-staging-integration 起点 36ce6565c414270552e288584423e8db1191c622 clean。当前预整合受审178与已运行Staging 220ec86cb6cfa695c83ea474247bb01150075131，main基线10b9a7d827e1c09f152ead58c21f26712d49a619；178仍等待最终CI，尚未合并或部署。此候选不能宣称实际main集成；CI全绿后仅正常merge178到main，再把实际main合并SHA正常merge至本分支，核对实际基线/来源并完成发布守卫。NETWORK_DEGRADED，仅本地checkpoint，不重复push失败通道或假称GitHub已交付。

保全：以两个完整祖先正常合并，仅两处UI重叠人工组合，保留Staging物料读取错误反馈/只读重新读取、历史起点/历史缺口与recordKind；保留178摘要/紧凑历史入口。自动合并订单挂载/已有测试，域API、0061–0067、权限、备份/Worker/ops脚本精确保持220字节；不改变176/172/173分支。717条冻结记录完整并集，旧hash/ID不改，能力/验收状态不借集成升级。实际main前向证据收口后才最终guard。

Staging只读实况：220/build staging-i174-220ec86c、app c0d84053…、Worker4d16d738…运行，正式配置/data/issue174-phase3-20261126b，原DB/对象/卷不变。6233数量54000、三色23000/17000/14000、交期2027-01-13，来源stale保留16自购/15采购记录/12入库记录，完成16项未知无百分比。

旧配对备份20261127T151646Z-2658b2bc、manifest SHA256 bb0e23d68fe8c33a4a234aab52c086d45bb06019c674293e41cd3259af1a3d01：57文件111724319字节哈希一致，147表/13附件，cleanup正向及原服务恢复。独立临时数据库恢复完整行/序列/附件引用验证ORIGINAL_RESTORE_VERIFIED，原服务和业务库不动。原crontab SHA256 c71caad3ddc46bf13a725ddd15e53b82345208ead6deb044e13dca3559716f82。

待完成：工程/隔离UI/最终CI/main合并/实际main集成/新版本与原Worker配对发布策略/正式发布前新备份及恢复门禁/只读验收。不得预写PASS。

预整合db785a：typecheck/完整lint/server build PASS、root1035/1035、release182/182、精确main10b9的47UI路径守卫PASS。离线候选image94c08e27…/op1cffd99…构建通过未上线。集成UI发现C3 driver仍等待默认折叠来源中的错误；本分支保留原role=alert和time/ISO详情、只读重读功能，并让driver实际展开来源后执行原403/网络/恢复/三GET/时区断言，不能删除此测试。其余五项维护页签/桌面/角色等正在原隔离套件验证。首次完整bundle过大已停自有传输，使用已有220对象的1.8MB增量bundle；首次镜像FROM误写裸digest被拒绝，改用核验精确digest的既有本地tag完成离线构建，没有改服务器网络/代理/拉取依赖。失败输出与所有旧资产保留。

H1浏览器其余物料历史/六宽物料排序/七角色/交付计划/分页/颜色/来源读取已通过；工作台错误场景断言要求原次级诊断继续明确不会回退Browser。现结合原Staging错误反馈，在展开来源错误行保留该既有边界，主指标仍全待核对且不含技术文案。没有通过改断言隐去。da918增量构建通过，C3真实展开回归正在运行。

2026-11-28：正常merge主线本地c04（catalog真实stale/指标断言加强及CI整job35分钟），仅共享摘要冲突并逐字归档主线版本，717历史记录不改。主线新代码NETWORK_DEGRADED暂未GitHub送达；未merge/deploy。集成F7完整type/lint/build及受影响compact/workbench两套25/25 PASS；其他五套H1的51/51为同保持组件结果，不伪造全76在F7重跑。
