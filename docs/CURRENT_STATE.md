# 当前状态：G6B生产排单本地整合

当前比较基线为已独立API核实的main 869ee84dd0b31de6161011e4aa560678b244a64d（2026-10-26T02:05:13.299Z）。branch codex/production-planning-main-869e从该main干净建立，普通合流原G6B b6af0cd247c1e7ec4406e69526fa672544cce1d8；稍后保留已整合G6A 910fbd4834336446abadb64c9d617b1ae868424b的完整历史。全部非docs与已验收源码cd73726babfaa86ffef671cbbe3a37fd542dace6逐blob相同，没有新业务改动。

源码和全部原QA证据精确复用cd737，不重复运行；本次只进行历史整合及精确N门禁，尚未最终PASS。排单是planned/cancelled，实际执行/完成、物流、出货、关账仍后置。

H订单读取链0d70的精确交付授权仍有效，实际Execute/Push/PR/Hosted均0。用户普通PowerShell的三种读取也在约5.3秒失败，故障不限Codex；TLS中断具体位置/原因及历史exit1仍未证明。本轮不再探测未改变的Git通道、不改共享代理/TLS/认证，资源与排单不借用H指定上传授权。PR129已按单独批准合并，其他合并/关闭未授权。

不应用0035到任何现有库，不改变3001/50426/59069/62426、真实账号/业务库/对象/卷/备份或旧Browser记录；没有新真实Source读取、绑定、激活、调度、部署或退役。

[本阶段](tasks/active/production-planning-main-869e-2026-10-26.md)记录真实合流与证据保存；完整G1–G8/R仍active，其他已保存H/7df/f3a/910f、原7da及所有旧分支/结果保持。
