# 配套界面、执行归属恢复与PR130合并批准

2026-10-28；用户对此前列明的三项直接答复“全部确认”。阶段clean输入 0900c2b0ae9bc875e91c4c124bb101f52d227250，分支feat/order-closing-month-plan。此处前向记录批准及已完成合并，不改写原pending提案或失败证据。

## 具体批准范围

1. 仅PR130转就绪并以merge commit合并，保留原始提交历史。批准绑定head 61704afe22fe9fd0ea9f6625c6092fcbb9575dfc、原main869ee84dd0b31de6161011e4aa560678b244a64d及此前三项成功CI/无阻断P1/P2复审；包含该PR既有API元数据/合并例外，不解除其他Git/ref写STOP。
2. [三处具体配套界面](../active/closing-support-interfaces-proposal-2026-10-28.md)：来源数量复核、执行方匹配、报价详情明确采用USD工价/历史。原提案在输入0900c2b0ae9bc875e91c4c124bb101f52d227250中保持原字节；原型SHA256为12c7d56bad06970775ae4a8bdbce21e435a44a0c5fa8e6661021750ed024b50a，本片已对实际本机HTML重新核实。不重做已批准的核心关账UI。
3. 对尚无实际产出的排单，合法改色/更换执行方后，原受影响开放关账片段经显式预览/确认返回未分配，再匹配；数量、月份、价格、生产事实及旧历史保持。确认/锁定期间先经原权限取消确认/重开；不能通过恢复搬动已产出归属。复用原月份命令/CAS/预览hash/幂等/审计/原回执，不另建数量账本。

## PR130已完成事实

合并前本片重新核对main/head、三项精确check runs均success、test-merge双父和tree。只更新PR正文、转为就绪、执行一次获准merge API；没有push或CI重跑。实际main为6479a713e2b80228f008049519ebbd50d10601a8，父提交依次为869ee84dd0b31de6161011e4aa560678b244a64d和61704afe22fe9fd0ea9f6625c6092fcbb9575dfc，tree46900a09200739db4a9e528c33b8fdc5331abac9与已验head完全一致；PR已merged。原分支未删除，其他PR未合并/关闭。

新merge对象通过既有API读得原始已验证签名payload，在写入本地object库之前先逐字节计算原Git SHA匹配，再存储同一对象；没有伪造commit或GitHub文件API交付，也没有Git网络/ref改写。首次构造少了签名的空延续行，hash不匹配而明确拒绝、没有对象/ref写；离线按原签名格式匹配成功，原失败保留。随后本地任务分支仅前向merge新main，保留双方原历史。

私密新回执在outputs/approved-support-flow-20261028。旧outputs在本次工作树起始不可见，因此未重新读取旧私密原件；既有Git冻结证明和本次直接CI/API核实分别使用，不声称旧raw仍可用。本次node_modules链接也缺失；已核实原依赖owner与本仓package-lock完全相同，仅恢复本任务本地junction，未安装依赖或修改共享依赖。

## 下一阶段与边界

按来源复核UI→执行方匹配/恢复→USD采用/历史分片checkpoint，复用D175已实现的有界无金额display读取，不再新造同义投影。实际变更后做对应客户端/模型/SQL/API/浏览器负控，集中最终构建/新main精确守卫与必要CI，原未改成功检查按source复用。当前批准记录不预报这些实现或测试通过。

用户此前已经人工确认62411能登录及打开调月弹窗，仅这两项；其余人工业务接受仍独立。所有旧页面/输入、3001/50426等环境、Browser存储、数据库/卷/备份及工作树保持；新SQL只在新owned合成隔离库验证。无新真实Source请求/激活/调度、真实账号或现有业务库操作、正式部署/切换、其他PR合并或旧资产退役授权。
