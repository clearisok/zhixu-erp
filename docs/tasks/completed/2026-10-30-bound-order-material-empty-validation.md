# 可信新合同物料空态：最终本地验收

2026-10-30（北京时间），分支 **fix/bound-order-material-empty-state**。产品源码checkpoint **92be38f5a2fe2c99e75a35fd913caeb32b5f0d03**，证据追加checkpoint **82bb45be8abd9e165498667a66b8e5b0001a8252**；比较main仍 **562fbf07f2caccfc9ba0d9c1a8e6a7e58436ee94**。本文件只收口[冻结工程记录](2026-10-30-bound-order-material-empty-state.md)的后续验证，不更改该记录或旧证据字节。

## 实际结果

| 验证 | 结果与精确范围 |
| --- | --- |
| 新PG/HTTP用例 | 最终7/7通过，含无采集空态、不借别单、401/400/no-store、停用、完整Discovery消失及hash/分页driver损坏负测 |
| 六文件相关合集 | 80项，79通过/0失败/1既有Windows跳过；Source/Python合成loopback、有效归属、到货计划、历史及物料HTTP |
| 类型、变更文件lint | 通过；driver负测加入后再次检查，未扩大成无关全仓扫描 |
| Server编译 | 通过；没有前端UI/打包配置或新依赖，不冒称完整前端/浏览器重新验收 |
| 最终发布基线测试 | **182/182通过，0失败/取消/跳过，614608毫秒**；在冻结证据集合上运行一次，未重跑已通过用例 |
| 精确源码/证据守卫 | baseline/history为main562、checkedHead82bb45be，12页/68能力/0变更UI文件，PASS |
| 独立审查 | 最终只读diff及下游复审无P1/P2，审查者未运行另一套测试或访问实际环境 |

首次较早的基线运行因后续文档修改而被明确取消，其进程树经身份核对后停止，不记作通过。最终182项并非将那次未完成运行重新标绿。源头两个新增场景的红测失败也保持为真实复现证据。

全部产品及测试变化均在92be源码checkpoint中；后继82bb只追加两个document evidence、保留全部旧record及PNG，没有能力部署状态晋升。最终文档收口后应对实际Git HEAD再执行精确守卫，安全回执记于ignored `outputs/material-empty-final-delivery-readiness.json`，不得以82bb的检查冒称别的产品版本已经部署。

## 当前交付边界

集中一次安全交付、精确远端核实、唯一草稿PR及一次必要PR CI仍须实际完成后记录；本地测试通过不是GitHub CI通过，也不是merge或部署批准。无新的真实艾诺科登录/查询、数据写入或宁波更新；运行中staging仍为main562。新Source窗口已经结束，不能借未使用预算重采。

CI配置已只读核对：source、team-access、baseline均为PR或显式dispatch触发，无重复push触发；已有concurrency、npm依赖缓存、超时。此次不改工作流，不手工批量重跑旧CI。

另完成一次只读G1入口观察（UTC2026-10-29T17:22:25Z）：3001、50426、59069、62326/62316/62310、62200、18443/18444、62411均未监听；54315和65139监听，并映射到main-4e7c5853f7及support-60b2e53765的gateway。没有停止/重启、端口切换、凭据/旧数据库读取或清理。未监听不等于已退役，3001仍受保护；旧50426目标选择、逐资产依赖解除及人工业务接受仍是完整Goal的剩余项，不能用本修复或宁波体验覆盖。
