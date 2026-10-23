# 成衣来源目标配置后台

## 职责与边界

D147 / D153 / D158 / D159的后续技术切片。Gate7G复用0040的单SO目标、不可变观察及读取时效，补 `planGarmentTarget / applyGarmentTarget / readGarmentTargetReceipt`，当时没有CLI接线。后续D161/Gate7H由原[操作者](AINUOKE_GARMENT_OPERATOR.md)的明确plan-target/apply-target/target-receipt调用本服务；不新增第二个CLI、HTTP、Catalog、调度或来源模型。真实目标激活与工程入口继续分开授权。

0044只新增空、completed-only的技术回执表。没有Source IO，故目标配置、审计和终态一次事务提交，无需复制0043采集前持久started的网络操作流程。原0040/0043及旧迁移保持；无默认目标、时效、数据回填或账号授权。真实启用、既有库升级、新查询额度和运行切换仍需具体授权，工程函数及scope hash不代表这些授权。

## 启用与停用

- enable接原 `GarmentCollectionRequest` 和明确的 `freshnessMs`，严格沿用0040的1000..86400000毫秒工程范围，不提供默认值。
- 原 `garmentCollectionProof` 重建具体账号、单合同、C1/C0/C1完整过滤证据。核对实际Source profile启用且指纹相同、唯一可信合同绑定、原物理owner/link/有效归属及当前订单版本；既有target账号身份不可换绑。
- 只保存证明摘要、策略和版本；不保存原报表或凭据。这里的过滤证明是历史证据，不是新鲜业务快照，也不授予新的Source请求额度。
- disable只需要sourceKey、原SO和操作账号，不依赖证明、当前profile、合同/颜色或head健康。历史alias可停止；无target则返回明确no-op、version0，不生成目标。停用保留指纹、原证明、时效及全部观察，只在实际变化时前移版本。
- 相同现行策略返回no-op；不同证明或策略须新请求及新预览。旧观察继续使用自己的原时效，当前策略不能延长历史快照；原采集scope中的target版本变化会阻止旧采集发布。

## 身份、权限与事务

每次重新读取未归档的启用账号及数据库角色授权，需要 `order.view / ainuoke.view / ainuoke.sync / ainuoke.bind`，不授予任何金额或账户管理权限。

预览为同一READ ONLY REPEATABLE READ，绑定实际库/连接指纹、actor、UUID、具体意图、profile/target/绑定与已有代际，有效期至多10分钟。预览无DB写入或Source读取；hash只证明技术范围。

写锁顺序：effective fence → 当前actor/角色/grant → actor/UUID请求锁 → 历史回执短路 → 原publication锁 → profile SHARE（仅启用）→ target UPDATE → 排序物理组/可信绑定（仅启用）。停用跳过profile、物理组及绑定。新执行在锁等待和范围重取后、写入前及提交前再次检查期限；不能用入口时钟延长许可。

target变更、原OperationLog和0044回执同事务。审计或回执失败全回滚；同actor/UUID并发返回同一历史结果，跨actor相同target预览只有一个CAS成功。请求意图或scope改变不能复用原UUID。

新审计operationId包含actor和原UUID，与回执身份一致。两个actor可合法使用相同UUID处理不同SO，但不会被原日志详情合并成一次操作；不改旧审计或旧查询消费者。

0044 INSERT核对当前精确启用/停用结果；之后不可UPDATE/DELETE。SO和原物理owner的FK同时进入原归一盘点和逐行完整指纹；这不开放归一执行，不移动任何生产或财务记录。

## 历史回执与异常

回执按当前fresh权限、原actor/UUID/sourceKey/SO读取，封闭校验原scope/payload/hash、原actor与结果。历史回执不读取当前target、profile、证明、凭据或head，也不要求permit仍新鲜。旧enable只返回当时成功，不能重新启用后来已停用的目标。

COMMIT响应丢失返回 `unverified_commit` 和null结果，不展示暂定成功，不自动重试。只读查询原UUID核对；unknown不证明从未写入，不换UUID或删除历史。回执公开结果只有action、版本、是否变化与启用状态，包含固定 `sourceRead=none / snapshotsPublished=0`，不包含账号、合同、颜色、原文、连接串或金额。

## 验证范围

`npm run test:garment-target-control`使用原producer的合成证明、自有一次性PG和计数fake collector，覆盖权限、CAS、锁等待、停用依赖、历史alias、原采集失效、策略冻结、COMMIT丢回执、审计/终态回滚、不可变与损坏回执、引用指纹及0043非空升级。原采集和观察回归另列，不把此命令当作Hosted CI、真实Source激活、部署或人工验收。

阶段源码、实际失败与检查结果见[Gate7G任务](../tasks/active/server-garment-target-control-2026-10-23.md)；原操作者接线单独见[Gate7H任务](../tasks/active/server-garment-target-operator-2026-10-23.md)。真实启用授权、多页证据、跨次事件、关账、coverage-v1与50426切换仍分别待Gate或业务确认。
