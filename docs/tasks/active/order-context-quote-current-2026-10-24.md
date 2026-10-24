# G5：可信订单上下文创建报价向当前 main 前移

2026-10-24；root唯一writer，既有server_convergence_review只读。先读规则、知识索引、
当前状态、相关feature/SQL与实际代码；06:03Z只读GitHub API核实main
`e01a11952b648024c0bd6bf4259de429374981e2`。从main新建
`codex/order-context-quote-current`后显式FF到已完成4B
`19c3faf2d7ab37a8ef1b332d5156b14e45382a56`，开始clean，原分支保留。
起点与逐文件核实在ignored `outputs/order-context-quote-current-20261024/`。

## 复用与现行兼容

原G5初始3d053、最终UI `54ef59e408c0b7f6bead8948b64500b64e5dcf86`、引用修复
`aaf12af31b5ba29a80fa98db9114a287f905c69a`是可复用代码，不是当前验收。
96e→aaf的19个产品/SQL/测试路径与当前输入逐项Git blob相等，全部核实后才写入。
保留当前main/#120金额与加工来源保护、当前Quote生命周期/owned浏览器驱动修复及4A/4B；
不复制旧workflow、manifest、能力标签、共享摘要或后续生产/出货/关账模块。

0033是原不可变创建参考技术表，接当前0032，不重写旧迁移或导入历史。
原aaf修复的FK引用清单、完整证据与预览负控同步前移，不能重现“创建成功却漏引用清单”。
只在自有一次性数据库验证；文件存在不授权升级目标或现有体验库。

## 已批准行为与安全边界

沿用D147已批准G5与原窄V1：首次维护来源中的次级“创建报价”→原new页只读合同上下文→
明确创建经销草稿→原Editor。普通列表D102一键默认创建不变。
服务器按稳定SO/有效归属/可信合同link核实；只预填保存款号、数量、交期，品牌/客户名称仅作快照，
不猜master ID。加工、已采用商业依据、完成/取消及历史alias阻断，未通过不能回落普通默认创建。

不可变创建参考与报价/审计/原receipt同事务；不写SO、CCT、商业采用、采购或排单。
同一报价仍可服务多单，返回订单后需客户确认并显式匹配报价来源。
上下文进入幂等hash，原普通hash兼容；两阶段重新核对来源/权限/设置并持有镜像共享锁。
已知业务拒绝留rejected，缺失回执不证明失败；挂载/刷新/返回只GET原请求，不自动再POST。
可信session/layout lease忽略旧成功/401，原商业金额与成本权限不变。

浏览器驱动复用原240s父级/20s轮询/15s CDP预算，未增加点击重试。
只将旧未确认退出即删profile的清理改为现有stopOwnedChromium、root Browser.close、
证据失败仍关HTTP/PG；未确认退出保留私有profile，不报告cleanup PASS。
这不是放宽断言、修改产品或额外用户业务规则。

## 验收与成本

先冻结本轮源码，再新建规范长路径owned archive；复用依赖，不安装，不重建旧环境。
相关单元/真实合成PG/API覆盖原普通创建、上下文、丢回执、CAS/权限/Source漂移、FK指纹及旧schema升级；
新真实构建/私有Chromium覆盖明确创建、刷新/返回、原Editor、迟到响应、无权与两尺寸来源/详情。
改变了创建与Editor引用后，相关Quote生命周期及P6/来源回归有重新验证理由；其他已通过范围不重复。
类型/Node实际载入/lint、双authority构建及原外部产物检查器、标准根测试和发布守卫按新SHA记录。

当前仅完成代码前移和语法检查，未宣称新单元/API/浏览器/构建/最终门禁通过。
4B的19c最终守卫、6ef after9/P6来源20、分阶段根945与原失败/精确SHA完整保留，不借用为G5通过。
当前manifest仍247/47；新能力只在新实际验收与冻结证明后添加。

#125仍CA草稿、精确4f API例外待原答复；不改变旧STOP、不重复push/CI、不创建累计重复PR。
无自动merge/close/deploy、真实凭据/Source读取、账号业务库/卷、绑定/激活/调度或旧入口退役。
完整Goal仍active，后续4C及生产/出货/关账保留各自依赖与授权。

## 冻结前静态复审纠正

独立review发现一项实际提交时序P2：来源弹窗busy解除后，父级passive onGuardChange可能尚未释放，
首次已启用“创建报价”被导航保护拦下。只把父级通知改为layout effect，全部阻塞逻辑保留；新built用例
用真实候选GET回复屏障和MutationObserver在fieldset首次enabled时单击一次，不补点或加延时掩盖。
这是静态发现，未声称已在新构建重现或通过；实际验收须核终态。
另将来源URL UUID与已有server creationId一样规范为小写，并同步原请求owner的URL比较，
增加大写合法UUID的单元及只读页面/返回正控，非新的来源规则。
此前19c的当前状态逐字归档于../completed/2026-10-24-order-context-input-state/CURRENT_STATE.md。
