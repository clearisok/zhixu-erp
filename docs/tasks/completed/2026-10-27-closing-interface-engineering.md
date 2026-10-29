# Gate8G2d工程证据

2026-10-27；branch `feat/order-closing-month-plan`，clean输入4525a74c554a77a70a74277fad5d88d49a1767ed。源码S **aba4719038b0de05804a397c44f49e32a6fc9162**，直接父为输入；main沿用核实869ee84dd0b31de6161011e4aa560678b244a64d，无fetch或远端写。

月份HTTP调用既有unpriced move/match/receipt服务；年度/月客户端共用原有界transport。旧financial controller公开调用和pending key/envelope保持，状态机提取供month controller共用；没有第二个写入器、Browser账本或自动重播。纯服务/客户端，无DOM/CSS/导航挂载。

独立只读复审两项年度DTO P2（冻结头/当前明细混用、月与年汇总不一致）已修：双向basis约束、提供的精确小计与阻断/适用计数核对，不从数量单价重算。最终0P1/P2；复审未执行测试、改文件或访问网络。

| 实际检查 | 结果和范围 |
| --- | --- |
| 旧客户端/控制器 | 36/36；新增后45/45，保留稳定旧key、未知回执、超时/ABA/撤权及只终态释放 |
| 真实HTTP/旧链 | 22/22，含并发、actor隔离、丢失已提交回执、边界、冻结和执行匹配 |
| 协议范围 | 69/69，29503ms；在最后两项DTO一致性修复前，不能冒称修后全跑 |
| 复审受影响组 | 修后13/13，11748ms；最后仅测试fixture显式收窄后6/6，集合重叠不相加 |
| 保留失败 | 初始warnings TDZ、generic Extract类型、两处测试union；汇总负控12/13来自fixture月/年共享对象；替换年度对象后补类型仍需先收窄allowed union，一次失败原件同样保留 |
| 规范副本 | 3154输入；最后运行时根类型30645ms、Server构建14172ms通过。仅负控测试前向替换并收窄后补根类型30980ms通过；14个本片TS/package字节绑定一致，未重复未变Server构建 |
| lint | 13TS通过，复审两文件及最后测试补lint通过，0warning |
| 发布门禁 | 清单538→539仅追加独立契约；旧538/68能力保持。精确main守卫在正式UI累计收口再运行，本片没有新守卫/完整144/Hosted结论 |

本机原始输出位于outputs/closing-interface-current-20261027，未提交原始运行日志、连接信息、临时PG或备份。根ignored冲突TS fixture、tsconfig与依赖保留；没有安装或以清理消除失败。

下一片接已批准正式Server关账调整UI，旧写入口整体收紧、Source异常更正、新镜像非空恢复和像素/用户验收仍后续。独立USD采用UI仍pending，68能力不提升，Goal active。0远端/Hosted/真实Source/现有账号业务库/合并部署/切换退役；旧环境、Browser、Docker卷和备份不操作。
