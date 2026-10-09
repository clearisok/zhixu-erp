# 当前状态

> 2026-10-09；当前任务：Quote Trial Release Preparation。历史证据见 [归档](tasks/completed/2026-10-09-pre-trial-state-history.md)。

## 目标与工程基线

- 最新已合并基线：PR #80，`d25aac7aa19a90ac1c1f573fbb60e420b7899e98`。报价试用范围锁定（D-098），优先让用户完成实际报价，不无限增加功能。
- 已合并/隔离验收：基础资料、新报价与成本、Revision/PV、Estimate、确认、附件、客户 Excel/ZIP、内部汇总、只读日志。工程测试通过不等于已部署或人工业务验收。
- 延期且不是首轮试用前置：整单复制/删除、Revision 删除、转订单、完整 Order/Scheduling/Closing、高级模板管理、列表缩略图。

## 最后确认的真实运行环境（本轮未复核）

- Windows 3001 最后确认运行 PR #64 的 `7658663038b1da504c95086711f627b6dce5c7a0` / Local Single-User；Q3 masters SERVER、旧 Quote BROWSER。3002 最后确认停止；真实 DB 最后确认 0001–0007。不能以最新 main SHA 代替容器版本。
- COS real Node preflight 已 PASS（PR #73 用户证据），不等于 runtime/CAM/secret mount 已验收。
- 旧 Ubuntu、Windows runtime、业务数据、Browser namespace 和 COS 保留，本轮不访问/修改。

## 本轮实际进度与下一步

- A/B 完成：一页状态、短接力、原始历史归档、D-098；AGENTS 新网络恢复协议与分类6/6。fetch reset 根因仍 unresolved；不改共享 Git/TLS/代理配置。
- C 完成：实际 Dockerfile.server 候选 `zhixu-quote-trial:9ee254db89c6`（源fullSHA `9ee254db89c6b02dbbb95e7a4b3d7c7e02763f23`），server/server/writable/session，编译/labels/runtime一致；独立 production TLS/MinIO/私有DB、非root600/ro凭据、显式0001–0008、空业务数据、认证/权限、重启/重建与管理员保留已验证。
- D 完成：第二个独立目标恢复Quote/历史/Estimate/附件字节SHA和页面；实际镜像smoke+恢复9/9、cleanup PASS。只清理本轮合成资源；用户未来录入数据不是可自动清理的测试数据。
- [最短操作入口与三张卡](../ops/quote-trial/README.md)已准备；人工业务验收 **NOT RUN**、真实部署 **NOT EXECUTED**。默认 Browser 保持；后续ops/docs commit不冒称既有候选镜像已重建。
- 剩余最小前置：审查候选，确认**独立新目标**、HTTPS访问与真实file mount/CAM/权限，另行授权部署后做三张卡。云机器/域名未提供不阻塞本轮工程；不将 Q5 或可选增强加回。

## 永久边界

- D-096：全部业务数据从空开始，历史导入 **NOT REQUIRED**；不导入不是删除授权。
- D-097：默认 Browser 不变，显式 Server authority；不回退旧数据。新 Revision 历史不可变、权限/CAS/事务/审计继续生效。
- 试用范围锁定不是 migration freeze；不暂停旧环境编辑。远程必须 session/真实权限与 HTTPS，不使用 Local Single-User。
- 本轮只工程/一次性合成验证，真实部署另行明确目标与授权；用户后续试用数据不得自动清理。
