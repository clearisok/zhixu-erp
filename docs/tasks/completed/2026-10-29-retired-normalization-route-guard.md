# 已退役归一入口：大小写绕过修复

2026-10-29；独立分支 `codex/retired-normalization-route-guard`，产品基线 main **5c8cb8037376288aa71043e799a057e21f1b985d**，修复源码 **6ec7a56671284f236a553afbfcedae376e1ca43a**。这是原已批准“取消订单归一写入”的边界修复，不增加订单归一、权限、业务规则或数据迁移。#132 的 `015dec7409e6109b9adbd638624d28dfd6ebc7f0` 不变，旧文档 checkpoint `032c553fc4ec2f30e9d4e8402e2ee86d3393c8e5` 在原分支保留。

## 实际缺陷及最小变更

`server/app.ts` 的前置归一退役规则区分大小写，后继 case、attribution、workspace 路由却使用 `/iu`。因此混合大小写可漏过410拦截，进入旧服务。原有会话、权限和业务条件仍适用，不是匿名写入漏洞；但“已经退役的命令仍可被有权账号调用”违反当前规则。

只将前置 normalization-cases、normalization-workspace 两个正则改为 `/iu`，与后继分流相同。鉴权、order.view、CSRF、GET/HEAD/OPTIONS 区分和历史读取不变；不把整个 URL 改为小写，不改其余业务路由或处理器。

## 验证与复审

所有数据库操作只在原 `startDisposablePostgres` 自建的一次性合成库中执行，没有真实/旧业务库、账号、艾诺科凭据或上游请求。

- **修复前复现**：先增加回归而不改产品，原 case service 完整文件14项中12通过、2失败（一个子测试连带父项）。混合大小写 events POST实际 **HTTP200、案件版本1→2**；原失败日志保留。
- **修复后**：同文件 **14/14通过**，0失败/取消/跳过，14553.5009ms。新增9个大小写/方法变体，覆盖case追加/创建/删除、attribution各写入口与workspace；403/401、错误Origin/请求标记、撤回order.view、历史GET均有检查；四张归一/归属/审计表与原历史不变。
- **类型**：按原 root/server tsconfig 选项，仅使用Git跟踪的canonical root inputs，961/254 roots，noEmit、无诊断；没有覆盖dist或删除ignored故意冲突样本。不是新前端构建。
- **lint**：实际两份变更TS文件通过；diff检查通过。既有大套件、浏览器、镜像恢复没有重复执行，也不记为本片新通过。
- **独立只读复审**：前次P2已关闭，无剩余P1/P2；审查者未重跑测试或读取真实数据。其余退役identity/preparation/commercial入口的拦截与后继都区分大小写，未发现同类遗漏。

日志与精确源文件SHA见[安全验证摘要](2026-10-29-retired-normalization-route-guard/validation-summary.json)。新回归已位于现有 `test:order-normalization`、原 Source CI 调用范围，不新增工作流、触发器或跳过测试。

## 交付状态与限制

新元数据按main5c8前向收口，原593证据和能力/页面/环境状态全部保留；最终精确源码守卫、远端SHA、唯一草稿PR和必要CI分别记录，未完成不提前声明。一次只读GitHub main核对在约5秒返回失败，原错误安全抑制；未因失败重试或修改共享代理/认证/TLS，不知道远端当前ref是否变化。安全交付常设授权仍有效，交付前/后使用既有工具核对，不自动merge或部署。

当前运行80ff镜像仍属于未含本修复的main5c8；本片通过不等于运行环境已修复。最终main合并及新镜像冻结后再按已批准范围落地。没有写真实订单、关账、Source、旧资产或宁波，没有复用真实采集额度；完整Gate0–8/R、#132 merge与成衣新具体读取许可仍待。
