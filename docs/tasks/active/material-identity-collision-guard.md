# 共用物料归并身份碰撞保护

核实2026-10-15；GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`；现有分支 `feat/order-effective-attribution`，本阶段起点 `b8473b6c39ba371059beab3979eb304c68faf0e1`。起点仅有本阶段已知红测文件（原SHA256 1df064605f10340e9371892affafd9bf9c00c85f84749c50487746490c3d0d44），无未知dirty。源码原blob `91cc61b50a2cdec8efc5422600f6b98937ab268c` 与该main相同。GitHub为实时事实源；本报告为工程快照。

## 已证实原因及修复

`stableMaterialHash`为32位短哈希。原Normalizer以ID作为Map键直接合并，未比较完整身份元组。合成编码SYN-CODE-38498/SYN-CODE-104406、不同名称，在其余固定字段相同时都得到需求短哈希1rwqpji：原两需求变为一需求。四类事件、Raw来源也可构造独立碰撞；字段分隔符和补充Unicode字符有确定性反例。

现保留全部旧ID算法，在每次normalize内部保存JSON结构化的规范化身份元组；相同ID但元组不同立即抛出静态`material_identity_hash_collision`及种类，不返回部分preview。不把业务字段写入异常消息。真实同需求/事件的重复来源仍归并，合并原Trace。

共用Excel/API Pipeline均受保护。API Preview在提交前拒绝；Server只读Projection复用原catch，清空事实、标记incomplete，不泄露来源字段或判断齐套。未新增UI、公式、单位推算、schema、Browser存储迁移或真实写入。

## 测试证据

原12项红测：3PASS/9FAIL，保存于忽略日志；实现后12/12，扩展Excel与Unicode后16/16。覆盖需求/Raw/四流碰撞、结构化分隔符、Excel共用路径、API Preview及Server错误清空，以及以下正向不变量：旧需求/事件/Raw ID冻结不变；356两来源归并一采购事件并保留两引用；Excel两入库保留独立事件；理论115.50与采购118独立；NFKC/空白/数字等价不误报。

本机根测试840/840、完整类型检查（禁incremental）、Server编译、全lint通过。后续精确基线与构建结果追加于同阶段接力，不把其他旧PG或UI验收写成本次重跑。First team access CI的既有`npm test`会包含该新根测试；本分支尚未送达，不能称Hosted CI已通过。

## 明确限制

只证明代码中可构造错误归并及本批Normalizer已阻断，不能证明真实数据受影响，也不能将此前六项单位冲突归因于此。没有重读全量或本机真实业务报告。本次没有修复所有32位哈希使用点：跨批Browser持久化、sourceArtifactHash/importBatchID仍需独立证据与兼容设计；不静默重建历史ID或改namespace。

`num_dyc`在当前原始字段可保留，但尚未有语义映射；6086941仍需独立固定只读Adapter和真实字段核验。这些后续工作不以本修复冒称已完成。

## 交付及更新

LOCAL工程测试如上，REMOTE待独立交付；无部署、合并、人工业务验收或Source激活。G1 PR109 head `1fcc440f00eeab962eb766161eab96ed5f67c6b4`已精确送达，2026-10-15 source/team-access/baseline三CI成功，已更新PR说明，未合并。G2仍需整合G1最后三笔测试/兼容修复。

证据路径：`features/style-progress/parser/material-normalization-pipeline.ts`、`tests/material-identity-collision.test.mjs`、`features/ainuoke-material-progress/projection.ts`；V0精确影响记录`docs/release/ui-changes/material-identity-collision-guard.json`。随身份规则、调用入口、测试、main/PR或真实核验变化更新，旧冻结图像/报告/hash保持。