# 恢复点：Gate7B固定合同过滤核验工具准备

2026-10-22；分支codex/garment-contract-filter-verification；独立main996dfedc12da3527343cd3ff2aa5eea35497e10e，从main建立后只FF至干净acfed2d091297c9fb587680a29ca6932892fa8ea。原三根文档逐字节归档在tasks/completed/2026-10-22-garment-filter-inputs/acfed2d0/；root唯一writer/既有reviewer只读。

先读[Gate7B任务](tasks/active/server-convergence-gate7b-filter-verification-2026-10-22.md)、[成衣观察契约](features/SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)、D152/153及实际probe/transport/lossless/private IO/PS wrapper。前轮为progress：acfed正常一次DELIVERED_VERIFIED/API及Git精确，63c三CI终态success（source39634167328/team39634173683/baseline39634178966），acfed纯文档精确守卫PASS/clean。旧Git错误仍unknown，不能说永久修复。

当前仅任务/基线文档，尚未新增代码/测试或真实请求。准备固定C1首页→虚拟零合同→C1首页，1login+最多3reports/100行/各4MiB/总12MiB/180秒、无翻页重试。真正执行前另批具体新额度；现有D1933/1935已用完，不读真实私密报告/凭据。CLI候选必须精确绑定已冻结D1933私密文件hash，不允许任意合同/report/page。所有校准结果只私密证据，不自动发布业务快照/激活。

复用既有Node24 exact numeric reviver、Python strict_json/transport/private报告读写，避免复制身份/业务系统。下一步完成独立只读预审，再串行实现/合成验收/commit/guard/安全交付。新测试只临时合成数据，不复用前轮数字作新PASS；不改生产UI/SQL/默认配置/Catalog或现有环境。

完整Goal active；关账三问题仍待用户原回答，不推断同意。按Gate0只验证引用，不新建累计PR/merge/close/deploy。保护全部旧环境/账号/Browser；62426只是旧8175 public health/build已读回，不等于全READY或新版。冻结报告c031/LF d96aea2e1810408122072f02bc5b5bc064da1d70f9808fcfaf444379ee8aea05与旧截图不动。
