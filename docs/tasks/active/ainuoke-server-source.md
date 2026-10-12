# Ainuoke Server Source 交付与复审

核实日期：2026-10-12；main 5215ef75510e4b55ef69b1ae1508816b80fda110。
Branch feat/ainuoke-server-source，独立 worktree ainuoke-server-source/zhixu-ainuoke-api；起始 clean。GitHub是实时事实源。更新时机：checkpoint、测试、PR/CI、范围或阻塞变化。

## 用户授权

按订单展示采购、入库、出运和出库；不做独立库存台账；保持 UI，合成测试后提交 PR 并复审。艾诺科数据持续展示后再上线 Ubuntu。未授权真实账号、数据库、部署或自动合并。凭据未来由用户私密配置。

## 工程与事实恢复

起始 fetch main 遇 connection reset。gh API 独立核实 main 为5215ef7…；本地 origin/main 与 commit 对象一致，因此从该精确对象创建任务 worktree，未退用旧分支、reset 或覆盖历史。
2026-10-12 gh API 核实 PR97 merged=true、merge_commit_sha=5215ef75510e4b55ef69b1ae1508816b80fda110、merged_at=2026-10-12T07:32:50Z；六角色能力已合并。其人工业务验收/真实部署/Source 状态不随 merge 升级。
PR98 为另一个宁波只读预检文档 PR；本分支不以它为代码基线，不擅合并。其 Quote-first 上线时序由本轮用户新条件更新。

G1 checkpoint：458c8f3b9b1bbb026644070bb47cc5cc290d5ed7，来源基础与20项来源专项、51项Python测试通过。后续增补Linux CLI端到端及聚合大小保护，最终结果见冻结工程证据。

## 实现与边界

[完整功能和启用契约](../../features/AINUOKE_SERVER_SOURCE.md)。本阶段持久化受控来源快照并复用既有物料只读DTO；不创建/更改SalesOrder、Quote、库存台账，不修改布局/样式、截图、Browser数据或生产路由白名单。
0012仅在随机命名、tmpfs、loopback的disposable PostgreSQL16执行。迁移前后的合成账号与密码hash逐项相等；日志不含来源凭据或织序金额。
现有 material 算法、6086103/6087050 catalog、可信权限与审计均复用；新采集器没有HTTP监听或可自选报表接口。

## 复审重点与已修正事项

- 部署包装漏Python：候选Dockerfile加入Python3与既有固定catalog worker；默认入口不采集。
- 持久来源完整性：Material与Discovery分别校验hash，篡改返回503。
- 失败原子性：注入审计失败验证run/snapshot/current pointer全回滚；来源失败隐藏旧事实。
- 身份边界：采集前后重新核对active用户/实际权限/订单version与绑定；账号fingerprint不允许无声切换。
- 网络与凭据：Linux私有普通文件、无symlink、大小/UTF-8限制；stdin传secret；固定HTTPS或受保护loopback；拒绝重定向和环境代理；stdout/stderr闭集错误。
- 资源边界：逐页与聚合大小、页数、订单数、行数、超时均有限，超限不发布部分数据。
- Windows合成测试不能冒充Linux私有文件/CLI验收；Linux专项由GitHub CI执行，最终结论必须待它通过。

## 状态区分

实现：本分支代码；合并：本PR未合并；合成验收：见本次测试；实际部署：无；人工业务验收：未运行；真实Source：未激活。
持续同步、首次正式订单绑定、页面生产接线和Ubuntu候选仍待后续Gate；本PR不得被当成已满足Ubuntu上线条件。

## 下一步

建议下个PR feat/ainuoke-continuous-material-display：先受控建立全量可见合同的正式订单绑定，再定时采集/状态可观测，复用P6页面做六角色与多轮变化验收。按独立可验证Gate推进，最后才请求真实来源私密配置及真实环境操作授权。

当前交付与最终测试/CI结论在最后更新；不自动merge。回退与明确未验证项见功能文档。
