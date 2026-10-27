# D176当前镜像与冻结保护恢复验收

2026-10-28；phase baseline clean cf77e1a6d7626808c3ba958137aeb52e5978976b，feat/order-closing-month-plan；沿用核实main869ee84dd0b31de6161011e4aa560678b244a64d，未fetch/远端写。前一Goal轮次为实际进展：两项P2、243相关回归、实际浏览器9及565守卫收口，新62411实机保留。

## 范围与当前证据

旧source125镜像最高0050，不能证明D176新增0051恢复。当前cf77与已验收业务源码fde8的全部非docs字节相同。新规范archive3221blobs/0overlay；Docker一次构建75481ms退出0，镜像zhixu-closing-frozen:cf77e1a6-20261028-37a075518b，ID sha256:ec2987de1be1dd31435a766081bafcbd11b98fe9efbc24333b236c5811ac74a6。精确labels、Server/session/snapshot静态产物、50迁移文件/最高0051已核对，未修改旧镜像/tag或安装宿主依赖。

只读审查发现两项本片验收保护缺口，而非已证明恢复丢数据：

1. 原全表/sequence与GET/回执即使缺失或停用0051 trigger也可能通过。新增真实红测试10中8通过2失败，均为Missing expected rejection。现财务快照必读精确public表/trigger/function、启用O、BEFORE INSERT ROW类型、无WHEN/参数/config/security-definer及0051原函数body；保存函数/trigger定义hash。源库维护停写后及恢复启动/登录之前再次核对完整catalog指纹，并纳入原不可变快照相等比较，不只看migration ledger。该增量仅测试harness，不改生产恢复、schema/API/领域规则。
2. 原私密wrapper继承默认Docker target。首次有界本机CLI读取失败，原因UNRESOLVED；随后显式本机pipe确认linux docker-desktop及上列唯一imageId，原失败保留。新恢复wrapper在任何restore mutation前拒DOCKER_HOST/DOCKER_CONTEXT，验证desktop-linux及精确本机npipe，并只给子进程设置已验证pipe；不改持久context/daemon/网络配置。构建之前没有这份fresh回执，不能追溯声称其已做；构建输出已独立在明确本机daemon找到。

定向控制28/28（277ms），包含原localDockerEndpoint正负控及原财务/领域回执负控；实际owned PG catalog测试1/1（6861ms），覆盖disabled、missing、换函数body、加search_path config、恢复后指纹差异拒绝。PG首个运行因测试专用client释放排在pool cleanup之后而卡住，仅识别并中止该测试child，原失败152858ms及中断回执保留，不能算PASS；改为try/finally先release后已通过，未停止/删除旧容器或用户数据。

## 当前待办与安全边界

完整非空恢复尚未执行，runtime attempt仍0；需要测试源码checkpoint与规范runner，再对已构建cf77镜像运行一次原9项恢复。新增harness属于独立测试源码，产品/SQL字节必须与cf77逐路径相同；镜像source与harness source分开记录，不为测试-only变更重复构建镜像。所有成功的既有未变控制按原blob复用，不把source125旧9项称本片新结果。

恢复仅两个新nonce owned项目，4个新/28须先避宿主路由与现有Docker网段。prepare成功才可能清理自身资源，失败停止保留。保护phase开始时68既有容器/191卷/33网络与所有旧refs；其identity/state/health检查不是业务内容审计。新62411、旧61104及预备53001只读build-info均返回原source；不重seed、替换、刷新用户页或清理数据。真实Source0、Hosted0、远端写0，无既有账号/业务库、merge、正式部署、切换或资产退役。

私密outputs/closing-frozen-image-recovery-20261028保留原baseline/prepared/build/image、红绿日志、原中断和local-target回执。三处配套UI与归属恢复仍独立待办，不能以本片验收代替完整Goal完成。
