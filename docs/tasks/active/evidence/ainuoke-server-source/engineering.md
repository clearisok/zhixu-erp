# Server Source 冻结工程证据

核实日期2026-10-12；main 5215ef75510e4b55ef69b1ae1508816b80fda110。
此文件与其所在Git commit共同冻结；后续证据另建版本，不改写旧结论。更新时机：新增验收、合并、部署或来源激活事实时新增证据。

## 状态分维度

- implemented=yes：该证据所在commit包含server/ainuoke-source、固定Python worker、0012来源表、CLI和默认关闭的读端接线。范围只含已有正式订单绑定的Source snapshots；不是持续运行/新订单建单或独立库存。
- merged=false：本功能仍在feat/ainuoke-server-source，未合并。
- isolatedTest=passed-historical：本日仅合成、loopback、disposable PostgreSQL16；专项21项中Windows实际PASS20，Linux专用CLI1项明确SKIP，须GitHub Ubuntu CI通过后才可最终建议合并。不是生产数据验收。
- humanAcceptance=not-run：本功能没有新的用户人工业务验收；历史P6验收只属于既有UI。
- sourceActivation=not-connected：没有连接真实Ainuoke、私密实测或调度激活。
- trial18443/preview18444=not-deployed，宁波也未部署。历史环境SHA/image不变，未重新观察。

## 验证记录

| 项目 | 结果与精确边界 |
| --- | --- |
| 来源专项 | 20 PASS / 1 Windows平台SKIP；六角色实际session HTTP四流，分页/异合同/secret/future/drift失败，幂等、并发、actor撤销、伪权限、订单version、来源消失、两个持久hash、审计回滚、真实Python子进程对合成upstream |
| Python | 52/52 PASS；复用原44项，新增8项覆盖分页/续期/远端明文/重定向/大小/闭集错误 |
| 全量PostgreSQL | 261/261 PASS；临时PG/MinIO，含历史迁移完整性、权限、报价/CCT/附件/导出、事务并发 |
| Fresh Start | 7/7 PASS；ledger12，schema/admin/permission技术白名单之外全部public表0，默认无Source profile/run或业务seed |
| TypeScript + server:build | PASS，最新Linux测试可编译 |
| ESLint | PASS |
| 默认Browser build | PASS，42路由静态构建不等于生产路由开放 |
| G1候选Server镜像包装 | build PASS；image sha256:3bf00e025f9f884f1a8bd2b71b5b16d001cb6c1f2272c5a7cf53a97646404551。仅G1工作快照包装检查，非最终发布镜像；network=none下CLI --help与Python fixed-catalog import PASS |
| root npm test / baseline | 冻结证据后执行；首跑被未对齐manifest/state正确阻断，未声称该次PASS |
| Linux CI / 人工 / 真实Source | 此证据冻结时未运行，后续以GitHub精确head checks及任务更新为准 |

之前迁移计数断言漏0012已更新；0011历史升级固定0001–0011临时目录，未修改0001–0011已发布SQL。source SQL只在本任务临时DB执行，原账号hash逐项保留。未SSH、未运行真实migration或部署。

## PR97 合并核实

2026-10-12 gh api repos/clearisok/zhixu-erp/pulls/97：
number=97，state=closed，merged=true，
merge_commit_sha=5215ef75510e4b55ef69b1ae1508816b80fda110，
merged_at=2026-10-12T07:32:50Z。
因此first-team-access merged可更新true；它的未部署/未人工验收/Source不适用不改变。

## UI 与复审证据

唯一features生产改动为operation-log.ts的TypeScript action/entity联合类型，未改renderer、CSS、页面、断点、截图或路由。
D-099/102/P6保持。V0精确路径记录见docs/release/ui-changes/ainuoke-server-source.json。
D-105记录用户真实新上线条件；5分钟/30分钟/24小时是AI建议，未冒称已获用户验收。
实施代码不调用StyleProgress commitImport或创建SalesOrder，不将订单价格字段反投影到物料API。
