# 报价保存成功后退出失败的安全重试

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。复用server-quote-to-order旧干净工作树，原feat/server-quote-to-order@a0e60e4e83cf67bfa22c36234c5dd9bf4495689d保留；确认无Node/Python活动进程或运行容器源码挂载。新fix/quote-logout-save-retry从已验68ac1fc9f839ebfc894d39377dac221e7f65566b/clean起，不混入6086941诊断分支，不新建工作树。

问题候选：finishDeparture在报价保存ACK后logout失败时保留pendingLogout；saveAndNavigate再次无条件requestPersist，持久化层在estimate未变时仍执行aggregate PUT，可能重复推进版本。另需核查未知保存结果后显式丢弃是否能绕过核对。先在现有真实Chromium/一次性PG框架补断言，用旧源码重现，再做最小handler修复；不改变UI布局/成本/单位/CCT/创建身份或Browser持久化。

验收：已保存后多次logout失败只允许一次报价PUT和一次持久版本推进；继续编辑后的新dirty仍保存；未知保存不再发PUT、不logout，保留草稿待显式核对。测试仅合成账号、随机一次性数据库和临时浏览器；不改变现有演示、真实数据或账号，不合并部署。远端PR和CI待Git通道交付核实。

## 已复现、修复与验收（2026-10-15）

旧产品源码68ac1fc9f839ebfc894d39377dac221e7f65566b上新增两项Chromium回归：原十项场景通过，两个新子场景失败（顶层汇总13项：10通过、3失败含父项）。退出失败后第二次“保存并退出”记录到第二次Quote PUT；保存未确认后“放弃并退出”跳至/login。该证据只证明重复请求，不据早期即时读取断言重复业务版本已落库。

最小修复：已获保存ACK、当前无新dirty的Server草稿仅重试退出；有后续编辑仍正常保存。保存待核对或成本同步未决时，不允许“放弃并退出/返回”绕过核对。沿用现有弹窗/菜单/错误提示，不改DOM布局、样式、路由、计算或持久模型。未知保存继续由既有显式Server重读核对，无Browser回退。

修复后真实Chromium＋随机一次性PG：13/13通过；保存后多次退出失败仅一次Quote PUT与一次版本推进，继续编辑产生新的确认保存；未知保存无新PUT/无logout，保留草稿和可信会话。测试等待每次新的退出失败请求完成，避免把上一条Toast当作本次保存完成。原七角色、四流、六宽页头/三宽页面、来源自动轮询/失败清屏及关闭路由的断言全部保留。Server/session/snapshot候选构建、typecheck、定向lint及112/112认证/报价持久化前端回归通过。

构建发生在HEAD仍68ac而工作区含本次自有修复的阶段；最终源码提交包含相同TSX字节，不把build-info的68ac冒称未修改源码。未新增截图或人工像素验收，旧PNG/hash不变。精确提交的发布基线和后续远端CI单独记录。未改现有运行演示/真实账号/业务DB/Source范围或部署。
