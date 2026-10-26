# Server物料分批到料界面与逐批物流

2026-10-24；D054/D065–069/D147的独立UI契约，沿用同一0039人工到仓owner，基础数据/SQL/权限/幂等规则见[后台冻结契约](SERVER_MATERIAL_ARRIVALS.md)。原后台证据按原Git blob保留，本文件不重写其记录日期或另建业务权威。当前产品a0c3与abf3驱动的真实QA见[工程证明](../tasks/completed/2026-10-24-material-arrival-ui-current-engineering.md)，合并/Source激活/部署/人工接受独立。

## 当前原页面接线阶段（2026-10-24，验收进行中）

原Server物料页独立读取同一人工计划owner，复用原卡片、分批到料Modal及历史Drawer。Source缺失仍查看原物理SO保存计划、25条锚定历史和原请求。只有未核实命令写actor/tab sessionStorage槽`zhixu.server.material-arrival.pending.v1.<publicUserUUID>`，先完整保存并读回再POST；挂载/刷新只恢复核对，不自动提交。已知回执核实身份和摘要后才释放自己的精确槽，unknown/pending/损坏/未来schema保留。临时槽不是业务权威，关标签或清站点不在保障内。

物流只读最早未取消的正式排单及采用地点快照，不跳过已完成或用后续内部单代替最早外发。Hub只取已存tracking；正式路线/方式当前版本仅用于当前测算，不伪称人工计划已冻结路线。每批复用唯一最慢可行算法，运输buffer和距上线分别展示，缺失/停用/歧义明确提示。style_progress.read只返回所需非金额白名单，不泄露资源联系人/备注或其他排单。

预览前重读并核tracking/source一致，命令仍由0039事务重验；页面/Modal/Drawer以session/layout/request owner隔离迟到成功、错误和401。现阶段源码受控前移，实际构建/新浏览器和完整回归待跑；原f287的16项结果不作本次PASS。见[当前UI任务](../tasks/active/server-material-arrival-ui-current-2026-10-24.md)。

当前候选同时保留加载禁用、同步inFlight与Source完成重读；依据变化仅暂停旧建议、保留草稿，显式重新读取后再预览。客户端不额外施加1000颜色业务限制，完整响应1MiB与0039的身份/数据字节预算保持，当前新测试验收按冻结source另记。

当前UI产品a0c3及abf3触摸测试驱动的实际97相关/811根、before3/after17/物料10/导航18、双构建与容量红绿已验证；[当前工程证明](../tasks/completed/2026-10-24-material-arrival-ui-current-engineering.md)冻结18PNG/3JSON、8图查看。此前“待验收”保留为该checkpoint时序；发布和最终精确main守卫另核，不代表合并、Source/部署或人工接受。独立UI命令要求MATERIAL_ARRIVALS_EXPECTED_SOURCE为实际构建full SHA；before另外仅接受已批准e2cf与before-only静态路径。
