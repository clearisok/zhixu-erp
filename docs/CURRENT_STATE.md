# 当前状态

> 2026-10-09；D-099 Windows 报价 UI 更新准备：**READY FOR UPDATE / WAIT FOR EXPLICIT APPROVAL**。候选已构建及隔离验证，真实环境未更新，用户UI验收PENDING。[身份/checksum/本轮测试与更新计划](tasks/active/d099-win01-update-preparation.md)；[原版审计](tasks/active/quote-original-ui-convergence.md)、[146张历史合成截图](tasks/assets/quote-original-convergence/README.md)。

## 当前工程与候选

- PR86已合并：UI source460a9c1，merge/build source `330aad7d1bfc8e93326e1eb4971a7a9f34a74514`。D-099保留PR64视觉/信息架构和Server安全/业务底线；组合列表、新建、共享Editor/成本/sticky/Portal/权限/CAS保持，无API/schema/权限/算法变更。
- 候选 `zhixu-quote-trial-d099:20261009T103901Z`，build `d099-win01-20261009T103901Z`、UTC10:39:01、server/server/writable/session。完整imageID/labels/build-info见审计。首候选103523Z因Windows换行转换不兼容0008，明确拒用；正式候选保留旧镜像原始SQL字节，八份均匹配真实ledger，不改migration/runner/DB。
- 本轮镜像隔离12/12（含app/gateway-only更新和独立恢复）、镜像前端Chromium62/62、auth/frontend67/67、readiness10/10、PR84白名单7/7、假命令备份失败5/5、npm674/674、typecheck/lint/build/diff-check/cleanup PASS。不是沿用PR86旧测试或人工验收。
- 已有个人列偏好保留字段布局/key/顺序/宽度，用户主动“恢复默认布局”才采用原版组合，不自动覆盖。缩略图/country/PV名称、整单复制/删除、Revision删除、转订单、完整Order/Scheduling/Closing仍延期。

## 真实win01与下一步

- 只读复核：`D:\zhixu-local-trial\win01`，project `zhixu-quote-trial-win01`，HTTPS localhost18443仅127.0.0.1。实际仍878de323镜像，三服务healthy/restart0，HTTPS database=ready，server/server/writable/session。quote_trial、独立volume/network未变，0001–0008 current/valid/pending0。
- 只读快照Quotes/Revisions/PVs2/2/2、附件/关系2/2、账号2、admin唯一启用；品牌/业务员/面辅料各1、未完成上传0。用户仍可编辑，此计数不是未来维护窗口冻结基线。
- PR84 OPEN，仅审查pinned helper/白名单，未合并。用户已解决密码并打开页面，完整三张业务卡未确认。下一步等明确授权：日常Backup及dump/manifest/对象SHA核验 → 重申停写/新基线 → 四项身份白名单投影 → 只换app/gateway → 三服务/HTTPS/数据读回 → 用户UI验收。不是重新setup/init。
- 本轮真实备份/配置写入/替换/重启/migration/账号/报价/Browser/COS操作均未执行；旧3000/3001/3002、Ubuntu未操作。失败保留现场，不自动restore/清理。详细部署历史见[归档](tasks/completed/2026-10-09-windows-trial-delivery-history.md)。

## 永久边界

- D-096历史导入NOT REQUIRED，旧数据保留，不导入不是删除授权。D-097 Server不回退mock/旧localStorage/IndexedDB；D-098 Quote-first。session/RBAC、字段权限、Decimal/null/zero、CAS/事务/审计、历史不可变不变。
- 工程、候选、部署、人工验收分开；默认Browser保持。远程必须认证授权/HTTPS，持久试用数据不可作为disposable清理。
