# 艾诺科 Server Source：按正式订单读取物料执行

核实日期：2026-10-12；main 基线：5215ef75510e4b55ef69b1ae1508816b80fda110。
GitHub/代码是实时事实源；此文是阶段快照。更新时机：来源契约、权限、凭据存放、迁移、调度、生产入口或实际激活证据改变。

## 用户决定与本阶段范围

用户批准 feat/ainuoke-server-source：按订单展示采购、入库、出运和出库；暂不做独立库存台账；保持现有 UI；先合成测试、PR 和复审。宁波 Ubuntu 必须在艾诺科数据持续展示后再上线。真实账号、数据库、部署和自动合并均未授权。

六角色按 D-104 可见同一个已授权采集来源的订单、物料及来源采购价；织序售价/工价/内部成本继续 D-103。用户首轮使用本人艾诺科账号，“全部合同可见”仍需未来私密实测，不能把权限配置当作来源覆盖证明。

D-105 更新 D-096 的“禁止自动来源补数”和 D-098 的宁波发布时序：现在允许开发受控来源读取；不导入旧环境账本，不自动创建正式订单，不改变任何订单/报价/库存事实。历史 Browser 导入与手工 Effective/Expected Arrival 不参与这个只读投影。

## 已实现事实

- server/ainuoke-source/ 是薄编排：复用可信 session/RBAC、既有 Source Adapter、Material Normalize/Dedup/Validate、厂供排除及 Material DTO。
- 已有正式订单 UUID + source link + contract mirror 三者必须一致。仅采集已有绑定，不依靠款号猜单，不自动建立 SalesOrder。
- 固定 6086103 空条件 Discovery → 每合同当前 InsideOrderNo 的 6087050 全分页 → 再次 Discovery。没有任意 reportId/SQL/条件接口。两次 Discovery 内容身份不一致则整批拒绝。
- 0012 只增加来源 profile、run、逐订单快照三表。来源 run、各订单快照、审计和 current pointer 在同一事务提交；失败保留旧 pointer，标记来源失败，旧事实不冒充当前。账号 fingerprint 固定，不能静默换账号。
- 同份 bundle 重试不重复 run/日志。新采集有独立证据时间；展示投影只读当前一代，事件不会跨代叠加。前后 Discovery 的时间不同不被误作内容变化。
- API GET 不读凭据、不访问艾诺科、不写业务表。匿名/无权/未知或当前来源缺失的订单失败关闭；陈旧来源返回 stale，失败返回 source_failed；原采购/入库/出运/出库结构不变。
- 合法完整空物料保持空；缺页/异合同/未知值不能伪造零。来源消失只撤去当前来源可见性，不删除订单或旧快照。InsideOrderNo 改变采用当前 Discovery，稳定 SalesOrder 不改写。
- 并发采集使用 sourceKey advisory lock；采集前及事务内重新检查用户与实际权限、订单 version/绑定。对材料与 Discovery 各自校验持久快照 SHA。
- 默认 ZHIXU_AINUOKE_SOURCE_READ=disabled；原 Browser authority、Server 路由白名单、CSS、截图和页面布局不变。只在明确 snapshot 配置时安装既有 orderMaterialRead。

## 凭据及采集命令边界

Linux 操作端使用仓库外、当前执行用户所有的普通文件，权限 0600/0400；拒绝 symlink、组/其他人可读、超长/非法 UTF-8、未知字段。Windows 不降级成明文配置；原 Windows Bridge Credential Manager 不变。

配置只接受 sourceKey、baseUrl、username、password、operatorUsername。operatorUsername 必须是已存在、active、有 ainuoke.view/order.view/style_progress.read/ainuoke.sync/style_progress.import 的织序操作人。密码不进入 argv、环境变量、数据库、日志或 Git；通过匿名 stdin 管道交给短命 Python worker。

baseUrl 必须为无用户信息/路径/query 的 HTTPS origin，或受保护通道终点的字面量 loopback HTTP。拒绝任意远端 HTTP 和重定向；不继承 HTTP proxy，不关闭 TLS 校验。已知旧艾诺科端点是 HTTP，尚无证据证明服务端安全通道就绪。这是未来真实激活前置，不能偷偷放宽成公网明文登录。loopback 只证明本机一段，SSH/VPN 后段仍须单独验明保护范围。上游协议将凭据放在 HTTPS 内的登录 query；上游/受控代理须避免记录 query，本工具从不输出完整 URL。

仅在未来获得真实操作授权后，才由用户私下填写凭据。开发和 CI 均用合成值，现在不需要用户发送密码。

命令在仓库/候选镜像工作目录运行，继承明确的数据库环境配置：

```text
npm run source:ainuoke -- --help
npm run source:ainuoke -- --check --config=/private/source.json
npm run source:ainuoke -- --execute=<sourceKey> --expected-target=<check返回的完整fingerprint> --config=/private/source.json
```

镜像使用 node dist/server/server/ainuoke-source/cli.js，相同参数。
--check 仅核实 migration ledger、操作权限、绑定订单数和目标指纹，不访问艾诺科、不建 profile、不修改 DB。
execute 必须 sourceKey 和 targetFingerprint 同时匹配；没有隐式 execute、scheduler、migration 或管理员 bootstrap。
Dockerfile.server 打包 Python3 与固定 worker，但默认 API 启动仍不采集。

只读服务配置必须显式给出：

| 设置 | 要求 |
| --- | --- |
| ZHIXU_AINUOKE_SOURCE_READ | snapshot；默认 disabled |
| ZHIXU_AINUOKE_SOURCE_KEY | 3–64 位小写 source key，匹配已采集 profile |
| ZHIXU_AINUOKE_SOURCE_MAX_AGE_MS | 明确的 1000–86400000 整数毫秒 |
| ZHIXU_IDENTITY_MODE | session |

上限：1000 个已绑定订单、每报表 200 页/每页50、整次100000行、聚合与输出32MiB、采集600秒。超限整体拒绝，不截断假成功。首次覆盖数量/采集时间超过这些边界时，先设计按范围代际发布，不能调大限制冒充已验证规模。

## 尚未实现 / 未验证

1. 没有定时服务、持续采集告警/退避策略或自动重启配置。代码合并不等于“源源不断”。
2. 没有空账本首次正式订单的来源绑定流程；旧 bootstrap 有冻结 migration guard，不得拿它直接绕过 0012 执行。全合同可见不代表所有合同都已生成正式订单。
3. 生产 Order/Material 路由仍关闭。已批准的 P6 页面复用/浏览器 E2E 激活属于下一阶段；本次没有新增截图或人工 UI PASS。
4. 未访问真实艾诺科、未验证安全链路/账号可见合同总数/真实报表字段与采集速率。现有4流字段算法有历史证据，本阶段测试仅合成。
5. 快照历史保留，无自动清理。数据库有写权限的运维不是防篡改信任边界；哈希用于误改检测，不是签名账本。快照不能代替备份。
6. 单来源共享团队模型；不支持多租户按合同授权。未来收紧要增加服务端范围控制，不能靠隐藏菜单。
7. Snapshot 只记录读取时点。上游没有事务快照协议；前后 Discovery 一致不能证明采购明细读取期间完全未变化，下一次完整采集会再投影。

## Ubuntu 上线 Gate

已确认发布条件：艾诺科采购/入库/出运/出库持续进入织序、按正确订单展示后，再上线 Ubuntu。独立库存台账、生产/关账 Server 不额外成为首版前置。

以下是 AI 建议的可执行验收标准，尚非用户另行确认的时间承诺：
- 完成独立账本首次订单绑定、受控调度、已有 UI 接线；不复用18443/18444数据库，不恢复旧账本。
- 初始建议每5分钟一次，30分钟过期；至少连续24小时观察，多轮新增/变更可见，失败明确、恢复不重计。真实速率/可见合同数实测后定最终参数。
- 抽查采购、入库、物料出运、出库各至少3张有数据单，并覆盖无物料、厂供、重复行、null/0、单位置异、InsideOrderNo变化及权限撤销。
- 六角色真实 session；采购价全可见，织序售价/工价/成本依角色；错误账号/改账号拒绝；重启与断网恢复不丢历史/不混旧缓存。
- 验证 HTTPS/安全来源通道、域名/Origin/代理、独立 DB/volume、0001–0012 ledger、备份恢复演练、镜像 source SHA 与回退演练。
- 用户在既有 P6 UI 完成人工业务验收；随后另行授权真实迁移、配置、部署。不能用 CI 代替。

回退：先停采集并禁用 snapshot reader，保留来源历史和正式订单；候选回退到经过核对的兼容版本。已有 runner 会拒绝比自身更新的 migration ledger，因此不能保证直接回滚旧镜像即启动；必须在隔离环境演练兼容候选，或恢复预发布备份到另一个独立 DB。禁止为回退删除 0012、ledger 或现存业务库。

证据：server/ainuoke-source/*、0012 SQL、tools/ainuoke-bridge/ainuoke_bridge/server_source.py、server/integration/ainuoke-server-source*、Python test_server_source.py、[任务报告](../tasks/active/ainuoke-server-source.md)。
