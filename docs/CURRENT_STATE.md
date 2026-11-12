# 当前状态：已人工验收，PR审计及staging交付进行中

2026-11-12用户正式接受8f5b5d89并授权安全PR合并及staging部署；不操作生产。main与线上仍6dc17c645215b3eb08e03624effdee2d182b3e1d。初始open仅#136（旧工具草稿、明确暂不合并、冲突），保留原状。新物料PR准备中，包含完整本机已验收历史，不删除分支。

重要既有问题：staging来源自11/11 15:52北京因catalog_changed_or_over_limit暂停，supervisor STOPPED_FAULT；620订单/物料head、5 queued。此次不自动清保护或重采，UI发布与来源恢复分开记录。原数据/人工内容/队列/时间保留。

本机演示63054仍运行、只读，源码5bef8388，8f5b5d89含最终交接；617副本保留，本机无源worker。生产部署工作流仅手动，未触发；新版本使用正常session/RBAC，不带demo入口。Git在进程级DNS/代理覆盖下读和fetch成功，未改共享配置或证书校验。

[本轮交付、全部PR审计及风险](tasks/active/material-staging-release-2026-11-12.md)，[本机验收](tasks/active/material-color-first-result-2026-11-12.md)。必要检查和发布未全部完成，不宣称已部署。
