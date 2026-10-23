# 成衣采集命令非空恢复验收

2026-10-23，Asia/Shanghai。仅合成工程证据，不是用户业务验收、真实Source激活或部署。

## 精确输入

- main独立API于10:23:07Z重读为`d1dd4f0fcf9992d5c055c7b67b6832b635485680`。
- 测试driver为干净`65545a743ff714a243dd3ea0ac30fa20028c8f59`，父`21604a1672ad72cc59c66d9d03abb6332f5ce525`；最初从干净e971继续原`codex/server-garment-collection-control`。
- 镜像仍是`357a88e513632cdb93e01698096daf1eaf099355`，ID `sha256:bf40f039690f5809e951b96977ee982dc87670bd90a87948294468de839a6b1a`，build `server-candidate-357a88e5-20261023-g7e-eac2bfe092`，buildTime `2026-10-23T08:07:49.406Z`。没有重建、重标或把65545冒充镜像源码。
- Git逐路径比较357→65545只含文档和七个测试/夹具文件；产品、SQL、Dockerfile、构建及运维输入相同。native调用原镜像compiled服务，不调用checkout的TypeScript。
- 本地Docker端点固定`npipe:////./pipe/dockerDesktopLinuxEngine`。每次native调用前核对自有项目、容器image/volume、唯一默认网络、Internal=true及Compose归属；不读取旧环境Env或Source凭据。

## 新覆盖与实际结果

原357演练9/9保留其原范围：0043表为空，不能证明命令域。本次将`ainuoke_garment_collection_commands`列入必须非空的覆盖表，缺表或空表均明确失败。

通过原`planGarmentCollection / collectGarmentOnce`实际生成三笔不同UUID请求：

| 状态 | 生成方式 | 重启和独立恢复后的结果 |
| --- | --- | --- |
| completed / published | 计数合成worker返回合法双遍输入，原事务发布 | 同UUID返回原publication，重放worker=0 |
| completed / not_published | 合成worker抛错，原服务保存失败终态；未知计数不补0 | 原失败回执不变，重放worker=0 |
| unverified_started | 原INSERT及真实COMMIT完成后仅丢失COMMIT回复；不伪造DB行 | started保留，不自动回收，重放worker=0 |

恢复后，另一个从未消费的旧permit先确认尚未过期，再确认实际DB指纹不同；原命令以精确`garment_collection_scope_changed`拒绝，worker=0。新预览仅调用一次合成worker并产生不同publication。普通再次加工下单、原执行方25件保留和新排单5件继续写入也通过；这是合成数据，不是客户生产事实。

最终完整Windows演练**9/9通过**，302720.1184ms，0失败/取消/跳过；包含七个阶段子项、父项和独立cleanup保护。共107张public表逐行哈希、行数及5个序列值/元数据在应用启动前一致；69张非空、38张空，0043恰3行。空表仅证明空状态保留，不宣称该业务域已执行。恢复后业务读取、所有原请求回执和合法新命令均通过。

记录4次实际自有app内部网络检查，覆盖两个项目。所有采集均显式注入计数fake worker，源配置只有合成账号；固定origin/policy用于原验证器，应用没有外网路由。worker帧中的3HTTP/2报表是合成协议计数，**真实Source请求为0**，不冒称Python/HTTP传输验收。没有伪造时钟；原成衣观察从fresh自然变stale，仍保留历史，不重标新鲜度。

最终原文回执`outputs/server-domain-recovery-20261023/run-d3c7f103dc.json`：

- 完成时间`2026-10-23T10:22:46.074Z`，SHA256 `198c282112065b72678975990215de123922f794302435c4e46e5dcedbc3b587`。
- proof SHA256 `301c2aec77d299adf2251256d1be50767c5a2a3060706b6735b912996a4ca8a3`。
- 项目`zhixu-quote-trial-it-d3c7f103dc`与`zhixu-quote-trial-recovery-d3c7f103dc`。完整成功后仅清理本次成功准备的自有资源；旧入口、数据和卷未操作。
- 外层`outputs/garment-command-recovery-20261023/run-5325453dc8/result.json`记录exit0、未超时、HEAD不变且工作树干净。

## 原失败与环境处理

1. 覆盖负测先实际RED：8总/7通过/1失败，缺少预期异常。补必需表后8/8通过211.8822ms；网络保护加入后9/9通过212.4692ms。四文件scoped lint、whitespace及65545精确d1dd源码守卫通过。21604的308绑定发布134/134通过505254.2028ms，HEAD/manifest稳定；它不是后继证据清单的验收。
2. 第一轮21604容器测试6总/4通过/2失败（含父），在`garment_filter_account_mismatch`停止，尚未恢复。夹具loopback地址不符合固定验证器要求，随后仅改夹具为原compiled origin/policy；产品检查未改。独立network=none容器验证了修正证明。最初该preflight漏传stdin，空输出即停，修正-i后才观察到通过。
3. 第二轮65545为9总/7通过/2失败（含父）：整库/序列和对象恢复已到达，应用启动前Docker命令失败，恢复后的服务读取未执行。保留项目的有界原CLI诊断确认**地址池/网段分配类失败**。脱敏布尔合并耗尽、无可用非重叠池和pool overlap三种匹配，不能独立细分原文；早期“耗尽”措辞过精，按此分类更正，不新增操作追索原文。
4. 仅对本阶段创建的三个失败项目核对精确容器/镜像/归属/卷名、全部停止及空网络端点后执行`compose down`，没有`--volumes`。释放13个自有容器/5个自有网络；全部原卷名、非目标container/network IDs前后核对保留。私密夹具、备份和报告保留，不改Docker地址池/daemon、旧环境或共享配置。同一65545、原357镜像、原600秒预算和全部断言不变，最终完整重验通过。原失败日志未删除。

## 交付和业务边界

本阶段没有产品、HTTP/CLI/Catalog、UI、迁移或业务规则变化。新的工程证明只补不可变技术回执的非空持久化恢复，不证明所有107表业务闭环、跨次出货事件、取消/冲销、财务关账或新真实范围。

e971三项Hosted CI成功保留其精确SHA和Windows跳过范围。#123的cb1658、#125的ca05已前向交付且仍草稿；两者六项新Actions均被账号Billing/支出上限在0steps拒绝启动，用户确认尚未处理，故不重跑、不改账单、不借别的SHA绿灯。65545后继证据/交付及CI状态另行记录，不在此冻结报告预报通过。

完整G1–G5继续。没有新Source请求、真实凭据/私密报告读取、现有账号/业务库写入、目标切换、调度、合并/关闭PR或部署。覆盖v1、关账原待决及50426切换/逐项退役不默认。
