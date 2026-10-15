# 多余仓语义确认与最小只读映射范围

核实2026-10-15；GitHub main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5。物理工作树沿用order-effective-attribution，独立分支feat/ainuoke-excess-warehouse，起始af9b7462b739fff45c84702883cd799b0e6871cd/clean；依赖尚未合并的Gate5整合与G1–G4，不冒称main已实现。

## 用户已确认

用户对本机旧报告的一张入库单明确答复：“1条是32条的一部分，不是31条的一部分，是31条之外的，同样以条计量”。因此该实例的rknum=31与num_dyc=1是两个独立事实；实际到货32条仅用于解释已核对实例，不新增全局库存总量或齐套公式。具体合同、物料、编码、单据号仅留在既有受保护报告及用户核对消息，不入Git。

既有批准范围要求入库事件增加多余仓字段；本次仅现有入库明细增加一列，后续事件侧栏复用同一DTO。其他布局、单位换算、正式TotalNum/cgnum/rknum和齐套不改。

## 已核实来源

[原历史字段证据](num-dyc-existing-evidence-2026-10-15.md)不改写。旧raw包SHA256为22e8af8692b07aedb9fe0690beb10883714d94531c09f08b979ac86c384c6cd9，工具29e41663389d8290fbc865db240f63c816f9c321，2026-10-13采集。13个合同、386来源行、117行存在num_dyc，269缺键；本轮零新HTTP、零数据库访问、零凭据读取。

当前Adapter原样保留rawFields.num_dyc；只读投影按既有入库事件sourceReferences回查原行，已归并事件的重复值取一致事实，不相加。同一事件混合缺失、不同值、非法/负数均保未知并给状态。缺单位只展示原数值及“单位未知”，不默认个；冲突单位不给可汇总数值。

## 技术决策与限制

每个入库DTO增加excessWarehouse对象，包含sourceField、quantity、unit、status、includedInInbound=false。不返回rawFields/sourceReferences，不新增SQL或写入路径。入库、采购事件ID、理论候选、采购/入库汇总、缺口与齐套结果保持原值。字段更新或移除随来源投影即时替换，不从上一代补值。

原包无preflightLineageVerified，仍只证明历史来源字段及样本追溯，不作为新鲜首绑/采集输入；用户样本确认不等同全量单位/库存或财务验收。独立PR待精确远端交付，当前网络NETWORK_DEGRADED，不自动恢复、合并、部署或改真实库。最终测试、截图与复审另写结果文档，不能把范围批准写成像素验收。

更新时机：字段语义、代码/负向测试、main/PR、来源或人工验收发生变化。
