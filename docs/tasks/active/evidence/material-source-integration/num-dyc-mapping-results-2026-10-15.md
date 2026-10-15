# 多余仓只读映射工程验收与复审

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5（本轮独立GitHub PR109 base再次核对）。分支feat/ainuoke-excess-warehouse，从feat/material-progress-integration的af9b7462b739fff45c84702883cd799b0e6871cd/clean分出；同一原物理工作树，不新建或清理旧树。产品源码049a87ba9aeef2e076ae8a7d69b753d18f4cd39b；最终UI脚本b8a8c0a9f2598656925730a1812481f4084c08c9。

## 结果

已实现用户要求的独立入库多余仓列。Projection读取同一既有入库事件sourceReferences对应rawFields.num_dyc，DTO显式includedInInbound=false。31条入库与额外1条各自显示；正式入库仍31、待入库仍1，不能因额外1而把订单判为入库32或齐套。采购实际与理论候选仍独立；356双来源一采购事件、TotalNum/cgnum及正式事件ID没有变化。

缺键/null/空白保持未知；显式0才显示0；非法/负/非有限/boolean不转0；同事件值冲突或部分来源缺字段失败关闭。缺单位保留源数值并明确单位未知，不默认个；冲突单位不给可汇总数值。重复来源/重复事件不累加，Source变更或移除不沿用旧值。不返回rawFields/sourceReferences，不新建SQL、数据库、库存台账或写入口。新页面对旧v1 DTO缺新字段显示未知，避免发布顺序差异导致整页异常。

[用户确认与范围](num-dyc-confirmed-scope-2026-10-15.md)、[脱敏历史离线统计](num-dyc-offline-statistics-2026-10-15.json)与原历史证据均保留；具体合同/物料/单号不入Git。旧包13个合同均与同包Discovery核对、4空；386原始行117有字段/269缺键，366入库事件117已知/249未知。这是旧历史样本追溯，未进行新真实读取，未冒称全量或当前接口验收。

## 实际验证

- 新增15/15负向及数量保护回归PASS；包含缺/0/非法/单位/重复/冲突/部分缺失/来源变化/无事件/不同需求/字段名冒用/无来源引用。不改断言降低未知计数。
- 完整根测试891/891 PASS；独立发布基线94/94 PASS，精确main源码门禁PASS（checkedHead049a87ba，46个UI路径已覆盖）。
- 持续Source领域/API/一次性PostgreSQL 70PASS、1个Linux条件skip；没有真实库连接。全PG261为前PhaseA历史证据，不写成本字段重新跑过。
- frontend无缓存类型、Server编译、相关源码eslint零警告均PASS。显式Server/session/snapshot UI构建049a87ba/buildId20261015-130555 PASS。
- 新实际Chromium5/5 PASS：1440/1280/390内滚动无document溢出、31与1分列；来源1→2→缺失→显式0；DTO无raw/内部商业字段；旧v1响应缺字段仍正常；物控合成账号可信会话、无Browser业务存储回退。
- 三张新截图与receipt在docs/tasks/assets/material-excess-warehouse-2026-10-15，AI目视通过；未覆盖旧图/哈希，非人工像素验收。B1既有21UI及后续加工9UI保留原构建范围，不混成本字段新统计。

原失败保留：最初未实现映射的新测12FAIL/1PASS；实现后定向68PASS。首次全根测试在D133尚未完成证据冻结时880PASS/10FAIL，守卫正确阻断旧决策漂移；前向绑定后891全绿，没有放宽守卫。一次刷新UI测试忽略loading会卸载事件面板，按真实交互重开当前面板后通过；旧DTO模拟起初只删rows而未删groups中的序列化副本，修正为真实旧结构后5全绿。最初离线工具试图从空合同首行定位身份而拒绝，改为同包可信Discovery核对，未改产品来源身份校验。

## 代码复审与交付边界

按源字段、事件身份、数量/单位、权限、旧接口、历史保护逐项复审，当前最小范围未发现阻断代码问题。最小生产增量仅excess-warehouse.ts、projection.ts和既有只读ControlTower列；其余为合成fixture/测试及证据。没有SQL、真实配置、账户、Source启动或部署改动。

LOCAL ENGINEERING PASS；REMOTE DELIVERY PENDING。NETWORK_DEGRADED沿用此前G5失败状态，本阶段不自动恢复或push。GitHub查询未发现同head PR，不重复创建；按AGENTS统一创建到main的Draft PR，明确当前累计差异包含尚未合并依赖，本字段独立增量以af9b746为对照；只有依赖先进入main、重新对齐并重跑门禁/CI后，才能作为最小字段PR评审合并，不能直接合并整个累计栈。Hosted CI尚未运行，不以本机测试冒充。无自动合并、真实激活、调度恢复、宁波/18443/18444或现有真实演示镜像切换。

待续：B2辅料团队排序设置与事件侧栏独立PR依赖本字段分支，避免反向把本PR吞入base；6086941另行独立来源核验，不按名称或同名字段自动关联物料。Goal未完成。更新时机：代码、main/PR、CI、字段语义、部署/来源或人工验收变化。
