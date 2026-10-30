# 品牌与导航体验：本地验收

日期2026-10-30；独立核实main/base `e37a131a7182a5488f440dcc8fde3ea66de1c6e4`。产品源码冻结在 `e4413f0fbb72736ebf0d5f750f73778c8a441e67`，后续仅交付文档和证据绑定。分支 `fix/brand-shell-navigation`。用户六图及Logo二次尺寸批准见[范围](../active/brand-shell-navigation-2026-10-30.md)。

## 实际结果

- 最终Server构建PASS，buildId `brand-shell-e4413f0f-7b0891fe`；构建日志SHA256 `552fe9a152a61cb531e0d639abbbba0657c1f05a742bf9be7d9a652a5cec9be9`。
- 真实Chromium＋一次性PostgreSQL验收22/22 PASS，顶层浏览器异常和Server错误均为空。覆盖透明Logo缩小30%、居中、侧栏收起、账号portal不裁剪、打开时切手机不残留、手机退出入口、三类辅料来源、桌面/手机附件菜单、慢网络、身份恢复、未保存、提交中和回执未知的导航保护。日志SHA256 `5333cd8532e5af4a333d9e05b2f93aa9680cbb4a22cfa013d977c484f3b809d9`。
- 类型、全量lint及后续受影响文件lint PASS；30项定向检查、14项报价API、18项附件/缩略图回归PASS。均使用合成数据及一次性库。
- 首轮项目检查964项：941成功、23失败。3个断言仍要求旧账号菜单源码形态；修订后两文件12/12通过。其余20个发布基线测试由清单仍锚定b1而当前文档锚定e37导致；对齐已核实main后，只重跑失败的20个测试及其子项，59/59通过。未重跑已经通过的全仓检查，也不将首轮失败记录改写为全绿。
- 首轮精确守卫发现UI记录页ID误写`quote-center`，已按实际目录修正为`quote-list`；最终提交守卫另行执行，不凭本文件宣称已通过。
- 独立只读复审无剩余P1/P2。初审发现账号portal跨断点残留，已通过卸载隐藏侧栏实例修复；真实浏览器验证后复审收口。

## 附件回归中发现并修复的问题

新增真实合成图片后，浏览器子项通过但顶层捕获两条AbortError。逐请求关联证明是GET附件下载在正常完成（writableFinished=true）后close事件无条件abort。下载及缩略图现在仅在未完成时取消；没有吞异常或扩大权限。回归明确验证正常下载零错误，以及实际中途取消仍触发存储AbortSignal；最终浏览器22/22包含完整错误断言。

## 性能证据与限制

一次旧公网观察为RSC约1257ms、后续报价API约513ms，无重复auth/me；该观测不是普遍基准。菜单增加已授权路由的意图预取和过渡提示，保持原导航保护。Excel导出改为用户执行导出时加载。构建依赖图中报价入口47项静态依赖不含929,919字节的ExcelJS块；没有声称每次路由节省固定秒数，没有缓存业务API或绕过鉴权。

## 合成截图

- [透明小号Logo](../assets/brand-shell-20261030/brand-transparent-reduced.png)
- [收起侧栏](../assets/brand-shell-20261030/brand-account-collapsed.png)
- [手机账号入口](../assets/brand-shell-20261030/brand-account-mobile.png)
- [品牌／业务／库](../assets/brand-shell-20261030/trim-origin-badges.png)
- [桌面附件菜单](../assets/brand-shell-20261030/attachment-actions-1440.png)
- [手机附件菜单](../assets/brand-shell-20261030/attachment-actions-390.png)

原PNG保持字节不变；Logo字标保留原深绿色。历史辅料缺少类别时不按当前品牌反推。新UI尚未合并、部署或获得实站人工验收。

## 已批准e37更新的独立状态

宁波e37镜像READY、恢复34路径读回PASS，与本片新UI分开。公网全套验收仍未完成：本机第一次中断、第二次build-info前超时；Ningbo通过真实公网域名及证书完成21条请求后在PI2609生产读取超时，退出成功。两笔验证登录均已撤销，原会话保留。

最终只读保全核对为`DATA_PRESERVED_PUBLIC_ACCEPTANCE_PENDING`：121表及序列按允许的验证登录增量逐项核对；业务数据一致，2次新增验证会话均撤销，12个其他旧容器、原DB/MinIO、全部原卷/网络、3000/3002端口与原隧道保持。3订单、2报价、2用户及附件保留。不据此声称公网全套PASS，不重跑来源或修改TTL。

无新真实艾诺科请求、绑定、激活或调度。本片不合并、不部署，不改真实业务数据；#136保持独立。完整Gate0–8/R及人工业务接受、旧路径退役边界保持。
