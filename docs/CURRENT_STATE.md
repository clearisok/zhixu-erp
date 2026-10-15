# 当前状态：Gate5联合候选本地验收完成，未交付或部署

核实2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。沿同一feat/material-sort-and-event-drawer，从68ac1fc9f839ebfc894d39377dac221e7f65566b/clean先快进已验Quote d9bf53b47f2f587d6c0db4954b0b8a55fe431638，再合入最新G4 4c59d974edd29cc82798884e70ff7586319f95ac（含G1–G3修复）。所有原refs/提交保留，无新树/重复PR，不合main。

G5既有小返回箭头、业务/工厂款号、去重复导航/说明、面料显示排序、团队辅料关键词设置、颜色规格展开、事件侧栏和num_dyc保持。管理员/物控写设置，七角色读；来源数量/单位/事件身份不改。多余仓单列，不加进rknum或齐套；对账仍待接入，不造金额或银行实付结论。

已验Quote退出重试修复现在纳入同一候选：保存已ACK且clean后只重试退出，新修改需再保存，未知保存仍保留；不再仅停留独立分支。D130更强准备outbox/回执/刷新保护保留，并带入其新增丢回执回归。没有改SQL、物料公式或生产/关账路由。

冲突仅三份共享摘要，三条原文完整[归档](tasks/completed/2026-10-15-gate5-before-verified-dependency-integration.md)，业务代码无冲突。既有冻结截图/hash与工程结果仍按原源码阅读，本轮实际通过：设置/客户端17/17；页头/退出/来源13、num_dyc5、身份6及物料展示9共33项浏览器覆盖（按下述两次构建分层）；typecheck、Server编译、Server/session/snapshot及默认Browser两authority构建、全源码lint（排除继承outputs私有生成物）、root898/898、基线94/94及精确main守卫PASS（11页/35能力/53继承UI路径）。

G1–G4新本地heads分别7ef6e665/e3cebb48/4da3590b/4c59d974，仍待新远端/CI；旧PR绿灯不替代新提交。G5原交付失败NETWORK_DEGRADED，不自动恢复推送/创建PR或合并；新候选仍需精确远端和Hosted CI。

Source48b63101/clean和其交付命令保持。6086941固定首页与两精确样本单位/币种证据已存在，新两合同完整分页查询仍待范围授权，不重复全量或用字段名认定映射。原四单2小时窗口12/12已结束，不重启；本轮不读凭据/报表、不操作真实账号/业务DB、Source首绑/激活/宁波18443/18444或现有真实演示镜像。
