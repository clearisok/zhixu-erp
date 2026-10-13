# 受控接纳新增艾诺科合同（D-112）

核实 2026-10-13；基线 `957fe1a6eedfd6a92020ef2cf82d710a4162cda0`（PR #106 合并后的 main）。本任务只交付工程命令与合成验证，不执行真实来源读取、业务数据库写入、账号配置或部署；用户仍须单独批准目标和真实执行。

## 已确认需求与现有边界

- 用户决定上线宁波前支持受控接纳新增合同。首次绑定只适用于空订单账本；既有调度只刷新已绑定订单四流，不能自动建新订单。
- 复用 6086103 全量 `current_account_visible` Discovery、6087105 选中合同的分色分码、现有正式订单 mapper、Source Link、Contract/Color Mirror、可信 session/RBAC 与审计。不是全公司可见证明。
- 缺失或权限变化的旧合同只阻断本次接纳，不删除、覆盖或自动解除旧订单。旧订单主信息与颜色不在本任务刷新，既有物料快照由下一次显式采集覆盖新增订单。

## 工程流程

1. `--check` 只读本地目标与迁移账本，得到完整目标指纹；不会访问上游。首次绑定和 Source Profile 必须已存在、账号指纹相同且启用。
2. `--discover-add` 只读 PostgreSQL 已绑定身份和两遍完整 6086103。两遍内容一致、旧合同仍可见且 `BillNo → sourceId` 不变时，输出当前账号可见的未绑定合同列表。没有颜色读取或写入。
3. 操作人明确选 1–25 个 `BillNo`。`--preview-add` 重新完整 Discovery，仅取选中合同的 6087105；复用正式 mapper，输出数量/颜色状态及 `reviewHash`，不写数据库。缺颜色不伪造颜色，缺数量/非法日期/选中范围不完整则失败。
4. `--add` 带同一选中列表、目标指纹与 `reviewHash`，重新读取来源并再次核对。事务内重新检查 `ainuoke.bind`、Source Profile、已绑定身份与采集互斥锁；全部订单创建与审计同事务提交。失败全部回滚，正式编号序列可留 gap；相同来源、选中集合、映射内容、已存 Contract/Color Mirror 与审计凭据允许精确重试，镜像变化不能伪装成成功重试。
5. 调度逻辑保持不变，只在后续采集轮次把新订单纳入物料快照。默认 API 启动不会发现或接纳新合同。

Linux 私密配置仍使用仓库外 `0600/0400` 文件。下列是工程命令格式，**不是当前真实执行授权**：

```text
npm run source:ainuoke -- --check --config=<private-file>
npm run source:ainuoke -- --discover-add=<source-key> --expected-target=<check-fingerprint> --config=<private-file>
npm run source:ainuoke -- --preview-add=<source-key> --contracts=<BillNo1,BillNo2> --expected-target=<check-fingerprint> --config=<private-file>
npm run source:ainuoke -- --add=<source-key> --contracts=<same-BillNos> --expected-target=<check-fingerprint> --expected-preview=<reviewHash> --config=<private-file>
```

没有新增 migration 或生产 UI 路由。`--discover-add` 可列出超过 25 个候选，但每次明确选择最多 25 个；不静默截断。旧绑定若在当前账号 Discovery 中消失，或 sourceId 冲突，本次接纳停止并交人工核查。

## 合成验证与未完成项

代码入口：`server/ainuoke-source/additions.ts`、`cli.ts`、`collector.ts`、`tools/ainuoke-bridge/ainuoke_bridge/server_source.py`；正式 mapper 复用 `sales-order-final-bootstrap-preview.ts`。合成测试覆盖只读发现/预览、选中颜色范围、数量与日期拒绝、身份漂移、来源变化、同批原子回滚、权限与账号边界、审计及精确重试。对应 `server/integration/ainuoke-additions*.test.ts` 和 Python `test_server_source.py`。

合并前复审补充三项临时 PostgreSQL 验证：采集持锁时新增接纳拒绝并无新订单；操作人在来源读取期间失效时事务内复核拒绝；接纳后下一次显式采集对旧/新两订单都保存持久物料快照。这些均为合成数据和一次性数据库。

本机验证：root 测试 817/817、发布基线 71/71、Python 固定来源测试 25/25、D-112 定向合成 PostgreSQL 测试 14/14，完整持续来源套件 43 PASS / 1 跳过（Linux-only CLI 子项在 Windows 跳过，须以 CI Linux 结果为准）；typecheck、lint、Server/UI build 和精确 main 基线守卫通过。此工程 PASS 不等于已在真实数据库运行，也不证明持续来源、字段业务验收、性能容量或宁波发布。后续 Gate：用户批准的隔离目标、私密凭据与源端/DB 预检；实际新增样本业务核对；连续四流与新增订单的持久快照验证；六角色人工验收、备份/回退及发布授权。远端交付与 Linux 验证结果以本分支唯一 PR 的最新精确 head CI 为准；每次实现、来源语义、执行边界或真实 Gate 结果变化时更新本文。
