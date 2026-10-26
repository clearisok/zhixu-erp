# 恢复点：G6B生产排单当前main本地整合

当前比较基线为已独立API核实的main 869ee84dd0b31de6161011e4aa560678b244a64d（2026-10-26T02:05:13.299Z）。branch codex/production-planning-main-869e从该main干净建立，普通合流原G6B b6af0cd247c1e7ec4406e69526fa672544cce1d8；稍后保留已整合G6A 910fbd4834336446abadb64c9d617b1ae868424b的完整历史。全部非docs与已验收源码cd73726babfaa86ffef671cbbe3a37fd542dace6逐blob相同，没有新业务改动。

先读[本阶段](tasks/active/production-planning-main-869e-2026-10-26.md)与outputs/production-planning-main-869e-20261026的preview、evidence-plan、start及同HEAD终态。先真实B父[N,b6]冻结、绑定新决定/生产文档记录，再合910f保留F/C历史并冻结第二真实决定合流；不改变原证据对象和守卫。268/811/各浏览器及质量/双构建严格按cd737复用，本次精确守卫和未来PR当前134分别记，不冒称新QA。

H订单读取链0d70的精确交付授权仍有效，实际Execute/Push/PR/Hosted均0。用户普通PowerShell的三种读取也在约5.3秒失败，故障不限Codex；TLS中断具体位置/原因及历史exit1仍未证明。本轮不再探测未改变的Git通道、不改共享代理/TLS/认证，资源与排单不借用H指定上传授权。PR129已按单独批准合并，其他合并/关闭未授权。

不应用0035到任何现有库，不改变3001/50426/59069/62426、真实账号/业务库/对象/卷/备份或旧Browser记录；没有新真实Source读取、绑定、激活、调度、部署或退役。

后续按依赖推进实际执行、4C、物流出货及待决关账；不以本地整合代替远端送达、正式部署或用户接受。
