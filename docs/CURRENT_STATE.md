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

- A：精简当前状态/接力、保留历史证据、同步规则与导航；仅文档检查。
- B：安全 Git 故障分类/恢复规则与模拟验证。
- C：独立 session + Server authority 候选镜像、新 DB/volume/network、合成 S3/凭据与启动/重启验证。
- D：独立备份恢复读回和三张人工试用卡；人工业务验收 **NOT RUN**。
- 真正试用前置：可运行候选与正确身份/隔离持久化、附件运行保护、基本恢复能力。本轮完成后按证据缩减剩余项，不将可选运营增强或 Q5 Gate 加回。

## 永久边界

- D-096：全部业务数据从空开始，历史导入 **NOT REQUIRED**；不导入不是删除授权。
- D-097：默认 Browser 不变，显式 Server authority；不回退旧数据。新 Revision 历史不可变、权限/CAS/事务/审计继续生效。
- 试用范围锁定不是 migration freeze；不暂停旧环境编辑。远程必须 session/真实权限与 HTTPS，不使用 Local Single-User。
- 本轮只工程/一次性合成验证，真实部署另行明确目标与授权；用户后续试用数据不得自动清理。
