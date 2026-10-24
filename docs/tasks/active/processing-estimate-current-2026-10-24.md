# 加工 Estimate 命令保护向当前 main 前移

2026-10-24；root 唯一 writer，沿用一个独立只读 reviewer。从本轮已核实 main
`e01a11952b648024c0bd6bf4259de429374981e2` 建立 `codex/server-processing-estimate-current`，
显式快进到报价验收收口 `7cf7238b93b309cc736b473eeedaba394e6a47b7`，开始 clean。
该前序 checkpoint 精确main守卫已 PASS（11页/46能力/22继承UI路径），其冻结2bd报价浏览器
87/87、独立复审无新增P1/P2，完整证据仍属于[前序任务](quote-server-current-acceptance-2026-10-24.md)。

## 最小复用与边界

前序只读审查指出加工响应/UI已隐藏Estimate，专用命令却仍能修改隐藏事实。
本地旧候选保留 `8ce227d05d9719653638493386693af819ef6827` 的三行保护及两个回归文件，
此次按原文件Git blob复用，不重新设计领域或重复调查。当前产品blob与旧修复前相同：
`1227b3b0ded9b9626bdc8041c554b65a7a4f8456`；两个原测试blob也与8ce父级一致。
原2026-10-21实际合成HTTP五命令200/写入的历史证据保留在8ce原任务Git对象；
不当作2026-10-24新运行，也不新增真实艾诺科请求。

本轮先仅前移测试，在未修产品实际得到12项中7pass/5fail（831ms进程耗时），
五个失败正是缺少 `estimate_not_applicable` 拒绝；日志保存在 ignored
`outputs/processing-estimate-current-20261024/red-unit*`，不把红灯称为通过。

修复在既有 `applyEstimateCommand` clone/分配身份之前检查保存的默认Revision，
当前加工统一409；经销默认中的加工历史、来源PV删除后的恢复、decimal/null/zero、
鉴权/CAS/审计/普通PUT保护不变。无新表、迁移、API、价格体系或Browser行为。
预期绿验收比较五命令拒绝前后的完整raw/version/audit，元数据保存保留隐藏事实，
以及经销合法生命周期与历史恢复正控。

## 验证与交付

先冻结源码，再使用新owned disposable PG/loopback API核验两个既有回归文件及类型/Node编译/lint。
前端产品未变，不重建或重复87报价浏览器/66其他当前UI；前序134发布回归的测试、守卫和237清单
blob未改，其原结果按原SHA保留。本阶段精确main守卫独立运行，不冒称已运行全项目或新CI。

#125精确API例外仍待答复，Git上传/ref/Actions未执行；不为累计依赖创建重复PR。
不merge/close/deploy，不改真实账号/业务库，不安装、变共享Git配置、读取凭据/真实Source、
绑定/激活/调度或退役任何环境。原Goal与G4以后闭环仍继续，不把此窄保护当成全项目完成。
