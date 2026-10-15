# Gate5 Phase A 来源与订单体系整合证据

核实日期2026-10-15；main基线064e3afaf7d08b3cb62907d4402f97d9c292f1e5；分支feat/material-progress-integration。起始HEAD4bdfa830733cd04d339fe2525f76730380ae3482/clean，合入原Source21da670b619f9ad745b4818ffc0a4eb50b9a501e。本报告随合并checkpoint保存，后续manifest绑定其真实Git blob，不虚构未来自指SHA。

## 已确认事实

- 17个冲突按职责整合。保留G1–G4的0014–0023、认领/血统/准备、独立商业采用、加工批次、有效归属/归一复核与不可变来源历史。旧Source的D113–120、受控人工单位/工厂采购责任、待定颜色0/提醒、顶部退出、固定只读诊断/选集首绑/隔离/窗口工具同时保留。未恢复废止报价直接建合同SO或旧共享订单CCT写价。
- 原Source manifest完整归档，新增非决策工程证据按原日期/commit/hash并入；D113–120和D121–131全文保留，D132说明组合。当前决策证据以后续版本前向替代，不能把两个历史分叉伪装成一条旧线，也不能改旧PNG/hash。
- 物料与列表alerts在同一请求的RR只读事务中读取可信actor、有效绑定、固定profile/run、scope/link/order版本和快照。直接详情和批量复用同一端口。新请求重验权限；cross-user端口复用、超过200单、哈希损坏、旧归属generation均失败关闭。没有HTTP或真实写入。人工确认深拷贝并保持原SO范围，不随归一自动迁移。
- 列表按可信合同businessType读取物料，不以原creationSource漏掉有效合同；历史别名不冒认当前物料。颜色计数按sourceOwner查询，旧UUID/来源/流水不变。
- 顶部退出复用既有报价未保存Modal及准备未知请求guard。退出失败保留内存草稿和会话；未知采用请求未被退出或新请求键丢弃。

## 实际验证与限制

1. 82项物料/颜色/人工确认/身份碰撞/异常分析单元PASS。
2. 初轮来源PG：26PASS、1FAIL、1Windows下Linux-only SKIP。唯一FAIL是旧alerts测试试图更新已不可变Source证据；未放松SQL，改为断言23514拒绝，并用独立driver字节损坏测试503和异常提醒。修正后两个受影响PG测试2/2PASS；其余初轮证据保留各自范围。
3. 20项实际Chromium子测试PASS：原P6四流、六角色及NoBrowserFallback、来源换代/失效恢复、1440/1280/390退出菜单、退出失败保留未保存Server报价；准备创建/采用/丢响应恢复/退出拦截，1920/1536@125%/1440/1280/900/390及七角色既有保护。
4. 类型与Server编译、显式Server UI构建PASS；新测试类型提示已修正后再通过完整类型。UI构建标识4bdfa830加本Phase dirty、buildId20261015-114218，不能称精确merge提交构建。源码eslint（排除dist/.next/ignored outputs）0错误，发现一个不再使用的Button导入并移除，最终复验另录。
5. 冻结前基线测试出现DECISION工作树漂移，以及尚未加入的ANCHOR错误码断言；这不是PASS。ANCHOR分支已修正，须在实际merge commit及决策前向冻结完成后重跑全部基线。旧失败不能删除或以跳过用例解决。

## 用户决定与未完成项

执行范围来自D121批准计划和既有局部UI批准；本Phase没有重新设计页面。未操作真实账号/业务DB/艾诺科写入、窗口、宁波或18443/18444，没有部署或合并main。既有窗口12/12回执单独保留，不以此次合成验收冒充新采集。

Phase B尚待：顶部小箭头、业务/工厂款号、去重复导航/说明、团队辅料排序、明细展开/事件侧栏。Phase C尚待num_dyc真实字段粒度和6086941独立来源核验。不是整个Gate5完成；网络仍NETWORK_DEGRADED，本Phase不重复push，当前无G5 PR。更新时机：精确源码/测试/证据、main/PR/授权或来源范围变化。
