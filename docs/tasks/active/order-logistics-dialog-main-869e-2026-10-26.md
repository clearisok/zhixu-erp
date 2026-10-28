# 当前main订单物料与运输弹窗整合

root唯一writer、既有独立审查者只读。

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T04:04:13.503Z独立API核实，开放PR为0；branch codex/order-logistics-dialog-main-869e从该main创建，显式快进已审订单集货仓依赖7db1ce2aff8b556e59d73f270a20817e48a69389后普通合流原弹窗阶段83a22eb3cff952f70ee209e2515453307cefbaa8。全部非docs精确等于测试驱动修复后2c286f3171ae19dc80cf251e26bf3505844c8f1c，与产品源码e2cf2bb4397a656b58cfab8388049bd84559527e只有原生产排单UI测试驱动一处差异，产品字节保持。

## 交互与数据边界

复用原生产页、订单抽屉、620px物料与运输Modal、预览与历史Drawer，不加导航或第二套页面/outbox。明确选择集货仓和备注，未记录显示未设置；先预览后保存。CAS重读保留草稿，须重新预览；只读角色展示保存事实，保留草稿不冒充已应用。计划、完成、物流共用原actor/tab未决槽；刷新仅GET核对，明确重试用原ID和内容。迟到响应绑定会话及具体抽屉实例，旧401不注销新会话；可选物流读取不阻塞原订单抽屉。

仅接独立订单tracking/currentHub与25条锚点历史；未接逐物料预计到仓或运输建议，不拿来源交期当到仓事实，不改排单、实际产出或价格。八个生产UI路径沿用原V1批准语义，当前记录只更新精确比较基线和阶段链接；原JSON逐字归档。

## 合流及验证归属

当前依赖与原83a共同祖先4a209；直接普通合流，沿用既有N/B/L及11c6同路径witness，保留全部实际父清单对象。原21个新增证据各有新路径，没有新的同路径文档分叉，不另造冗余mergeOf。

原产品archive SHA256 b98ec655ebeffea70f9011c128922dc45346b97034de1c3cdd18a5a1440da35c、driver archive SHA256 25830525e45985977fe0ab9a260621f8b2da08395cee8fa9b6c24b3563052f25及各自context已核对。386相关API/升级、根811、类型/Node/import/lint、双构建来自e2cf产品范围；after37/资源23/导航18来自2c286f修复驱动，before2仍为07d客户端配e2cf后台。17PNG/2JSON、42geometry及proof 54c28cec392a435b1fcffedfa47e32c4b7f5f98b原字节保留。首轮34/2失败和等待修复记录不抹除。以上均历史范围复用，不称本轮新执行；原7f0d4c发布134和83a旧base守卫仍归2026-10-24。最终commit后本轮只新跑精确N源码守卫，正式PR仍须当前发布134和必要三CI。

准备时最终commit、精确N守卫和独立复审尚未完成；以outputs/order-logistics-dialog-main-869e-20261026同HEAD回执为准，缺失不算PASS。原[阶段任务](server-order-logistics-dialog-current-2026-10-24.md)和[工程证明](../completed/2026-10-24-order-logistics-dialog-current-engineering.md)的source/driver/失败/日期及限制保留。

## 交付和完整目标

H0d70精确交付授权保留，Execute/Push/新PR/Hosted仍0；普通PowerShell亦复现TLS失败，根因未确认，不重复未改变通道探测或修改共享代理/TLS/认证，不将H授权扩大到本分支。未自动合并或关闭PR。

不改0034–0038/schema、角色grant、币种、公式或Source范围；不读写Browser长期账本，不导入/Seed/清库。没有真实账号、业务库、凭据、Source、对象/卷/备份操作，不替换3001/50426/59069/62426入口，不部署、激活、调度或退役。原7db/588d/81f及38580镜像分支和所有旧结果保持。

完整G1–G8/R active；后续先0039人工预计到仓后台和UI，再0040/41成衣出运观察及0042交期依赖。Server关账三问、真实Source新额度/激活、目标切换、人验与退役授权仍独立，不把本地UI整合冒称已部署或用户闭环接受。
