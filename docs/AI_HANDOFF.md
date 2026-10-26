# 恢复点：当前main物料与运输弹窗整合

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T04:04:13.503Z独立API核实，开放PR为0；branch codex/order-logistics-dialog-main-869e从该main创建，显式快进已审订单集货仓依赖7db1ce2aff8b556e59d73f270a20817e48a69389后普通合流原弹窗阶段83a22eb3cff952f70ee209e2515453307cefbaa8。全部非docs精确等于测试驱动修复后2c286f3171ae19dc80cf251e26bf3505844c8f1c，与产品源码e2cf2bb4397a656b58cfab8388049bd84559527e只有原生产排单UI测试驱动一处差异，产品字节保持。

先读[阶段](tasks/active/order-logistics-dialog-main-869e-2026-10-26.md)与outputs/order-logistics-dialog-main-869e-20261026同HEAD终态。真实merge父应为[7db,83a]；原21新证据合入后374/54/21routes，决定单叶与原witness保持。八路径V1只base/link前向，46个继承UI记录不改；全部非docs精确2c286f，除原测试驱动外产品精确e2cf。

原产品archive SHA256 b98ec655ebeffea70f9011c128922dc45346b97034de1c3cdd18a5a1440da35c、driver archive SHA256 25830525e45985977fe0ab9a260621f8b2da08395cee8fa9b6c24b3563052f25及各自context已核对。386相关API/升级、根811、类型/Node/import/lint、双构建来自e2cf产品范围；after37/资源23/导航18来自2c286f修复驱动，before2仍为07d客户端配e2cf后台。17PNG/2JSON、42geometry及proof 54c28cec392a435b1fcffedfa47e32c4b7f5f98b原字节保留。首轮34/2失败和等待修复记录不抹除。以上均历史范围复用，不称本轮新执行；原7f0d4c发布134和83a旧base守卫仍归2026-10-24。最终commit后本轮只新跑精确N源码守卫，正式PR仍须当前发布134和必要三CI。

H0d70精确交付授权保留，Execute/Push/新PR/Hosted仍0；普通PowerShell亦复现TLS失败，根因未确认，不重复未改变通道探测或修改共享代理/TLS/认证，不将H授权扩大到本分支。未自动合并或关闭PR。

不改0034–0038/schema、角色grant、币种、公式或Source范围；不读写Browser长期账本，不导入/Seed/清库。没有真实账号、业务库、凭据、Source、对象/卷/备份操作，不替换3001/50426/59069/62426入口，不部署、激活、调度或退役。原7db/588d/81f及38580镜像分支和所有旧结果保持。

继续0039后台及UI，再按真实迁移前缀推进出运/交期；完整Goal active，真实切换/人验/退役不擅定。
