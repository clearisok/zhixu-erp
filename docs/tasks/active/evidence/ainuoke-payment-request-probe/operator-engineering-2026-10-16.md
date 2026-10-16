# D142 财务来源操作入口：隔离工程冻结证据

核实日期2026-10-16。GitHub main：064e3afaf7d08b3cb62907d4402f97d9c292f1e5；GitHub为实时事实源。本文件是阶段快照，新增验证用新文件/新ID前向追加，不覆盖原报告或截图。

## 精确范围

- 同一ainuoke-live-readiness工作树，feat/ainuoke-payment-operator；父PR113精确3896d66837a25875cf9c364126cfd6c804250b80，原collector引用和其他树保留。
- 核心checkpoint：9ab67f9da0faf6e5077e706fce584fdcc3e06152。
- 完整源码：6658f0c1d221f581adcc94582bb6538e7654b3c1；干净树下实际源码入口只读回执成功。后续文档/manifest提交不冒称另一源码构建。
- 复用D137/D139/D141的固定两合同worker、历史过滤验证、逐SO快照/有效归属；无HTTP写入、持续scheduler或生产UI改动。独立草稿依赖PR113及其累计前序，不建议直接合并累计代码。

## 已确认工程事实

1. 只读目标/采集计划绑定DB及连接、操作人、精确S1/S2 SO/合同、账号、有效归属/版本/代际、过滤证明和请求有效期；hash不是人类授权。启用重建完整两遍历史证明；它不能当成新快照或整体单位/币种确认。
2. 两目标启停、审计、终态技术回执同事务；缺权限/错身份/旧范围全部拒绝。停用不需要新读取、profile启用或无关绑定健康。版本递增使停启后旧快照不可继续显示；重放旧enable只返回历史，不重新启用。
3. 单次采集在worker前持久提交started。并发同ID、终态和started重放均无新增worker；实际输入selection/targets/operator/证明hash也纳入payload，不能保留旧scopeHash同时换SO。密码不纳入回执/公开输出。
4. claim COMMIT回执丢失时0上游调用；目标或终态COMMIT回执丢失分别返回不确定并保留实际已知结果。只读回执是历史记录，started不证明进程仍运行，not_found不证明从未执行，不自动重试/回收/重采。
5. 私有job/报告受保护且Git忽略；Windows owner/SYSTEM DACL和无reparse、POSIX当前UID/0600；打开前后检查FD/路径/size/mtime/硬链接身份，job/报告完整文件SHA，严格UTF8/大小限制。现有凭据ACL不改；只在单次采集的范围核对后读取独立本机文件，未将凭据写入job、终端、报告或Git。
6. 0026只新增不可变技术回执表；不启用目标/账号、不回填。入口只检查迁移和已有操作人，缺迁移时公共schema仍0表；无migration/bootstrap模式。
7. 非空0025隔离升级仅应用0026，旧用户/订单/mirror/profile/target/snapshot/head/log逐表全量hash不变、技术表0行；重复运行无新迁移。旧目录缺0026时严格检查拒绝，因此回退不能承诺直接换旧镜像；应保留兼容代码/历史、停用目标和新调用。

## 实际验证

| 验证 | 实际结果与证据 |
|---|---|
| 新增模型/文件/目标/命令/入口/升级 | 21/21；outputs/payment-operator-clean-6658f0c1-20261016.log，包含实际源码子进程clean checkout回执查询 |
| 原财务协调/存储/快照/两合同/客户端 | 112/112；outputs/payment-operator-related-20261016.log；FakeTransport/自建PG，无真实HTTP |
| 完整PostgreSQL套件 | 261/261；outputs/payment-operator-postgres-20261016.log，随机owned数据库/MinIO夹具 |
| 类型 / Server编译 / 源码lint | PASS；precommit-type、lint日志保留；未跳过正式错误 |
| 默认Browser生产构建 | PASS，源码6658f0c1d221f581adcc94582bb6538e7654b3c1，build20261016-122100；quote/master=browser、identity=session、orderRead=disabled；未打开生产Source |
| 完整root / 94发布基线 / 精确main守卫 | 在本冻结报告绑定后执行，最终结果另记任务/PR，不以本表提前宣称通过 |
| 新PR / Hosted CI / 合并 | 本报告冻结时未交付；精确远端与最终CI另核，未合并 |

失败也保留：初次permit范围hash误带自身scopeHash，明确选字段后13项通过；新增缺迁移用例用了非法小写合同，修合法合成身份后验证到达pending_migrations；初次新增TS收窄/Stats类型错误已修。原日志未覆盖。没有为通过测试删除断言、改源数据或升级业务状态。

## 用户决定、建议与未验证项

- 用户批准的业务规则与计划D121及后续页面/来源要求继续保持；本阶段是技术实施，未追加人类业务确认。
- 最近一次真实两合同读取12/9行、两遍一致、5HTTP/4report为既有历史证据，其一次许可已用完。本阶段无新真实来源读取，整体mappingVerified仍false，不推银行实付或将旧两行确认传播到其余行。
- 真实数据库/迁移、精确SO/合同目标、启停、刷新及新读取预算需提交具体计划另获批准。0026仅在一次性测试库执行。没有真实账号/业务DB/当前演示/宁波18443/18444/部署或旧窗口续期。
- 当前财务只支持显式一次采集，不声称实时推送或持续调度；对账口径、物料逐行匹配与真实业务人工验收也未完成。加工不适用、unknown/0/独立数量金额和CCT隔离不变。

更新时机：下一次源码/权限/来源字段、真实范围授权、构建/CI、运行环境或人工验收变化时，用新证据追加并更新活动任务。不得仅修改能力标签升级合并、部署、人工验收或Source启用状态。
