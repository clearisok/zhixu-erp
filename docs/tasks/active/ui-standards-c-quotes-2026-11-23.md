# Issue165 批次C1：报价模块六项

2026-11-23；按原审查v1批次C模块拆分，仅Q01/Q04/Q05/Q07/Q08/Q09。独立分支fix/ui-standards-c-quotes从经GitHub再次核实main 10b9a7d827e1c09f152ead58c21f26712d49a619 clean创建，HEAD起点同此，不混入A/B代码。Refs [Issue165](https://github.com/clearisok/zhixu-erp/issues/165)、[冻结报告PR166](https://github.com/clearisok/zhixu-erp/pull/166)、[用户批准](ui-standards-approval-2026-11-23.md)。

|编号|实际改动|保留|
|---|---|---|
|Q01|删基础/成本/辅料重复快照教学及QuoteRevision概念句|历史只读、快照实际修改影响、商业确认状态|
|Q04|删除聚焦粘贴区重复按钮；区域标题粘贴或拖入图片，保留Ctrl+V|区域焦点、粘贴/拖入处理、上传状态/错误|
|Q05|删除styleImageAttachmentId技术解释，单句说明当前报价移除后暂无款式图且不自动替换|取消/确认删除、原unlink、历史关系/物理对象不变|
|Q07|PriceVersion/Estimate/PV改业务名称与整张报价估算范围|默认不选、当前估算、重复展示不重复合计、25张/500行/20MB|
|Q08|仅去Server/Browser对照句|正式模板名、版本、全部/当前方案、未保存警告|
|Q09|仅删Server操作记录重复description|事件/筛选/权限；Browser历史说明保持|

本批不改公式、业务回调、接口、存储、数据或权限；D01–D10不实施。V3保守精确路径登记，用户原38项授权覆盖本批。manifest仅更新核实main锚点与时间，其余冻结字段逐项比对保持，旧摘要按Git原字节归档。

## 验证
代码修改后待检查，不预写PASS。Staging既有RECOVERY_BLOCKED / backup_cleanup_unverified（originalFault backup_failed_requires_review）仍阻断，未切版/恢复/重启；Production禁止。

## 工程收口
- 产品源码37379356851a56c3cc19844d66b10c68830b5e57，后续6e29bc82仅更新粘贴区既有测试的过期文案断言；仍检查区域限定监听、无document全局粘贴、预览contain等原约束，未跳过用例。
- typecheck、完整lint、Server frontend build PASS；显式release182/182 PASS；纠正后完整root1026/1026 PASS。初轮root1025/1026因旧“直接Ctrl+V”断言失败如实保留，不是业务逻辑失败。精确源码门禁待最终checkpoint核实。
- actual compact9/9 PASS。扩展完整Quote套件78项中71 PASS、7 FAIL（包括父级），实质三类：旧币种夹具PUT被拒、旧默认列遗漏confirmedGarment、1280旧严格列宽断言。未改动的main10b9以相同构建参数/原脚本在独立临时PG/Chromium逐项复现相同三类和相同1280 table1104/container1021，计数同为71/78；不能将该套件写为全PASS。
- 完整Quote套件实际上传、快照/版本、计算同步、权限、客户XLSX/ZIP及审计多项通过；三类既有失败未按本轮文案需求修改业务逻辑、冻结列宽或用户待定D03。保留既有阻塞，不以compact或root替代完整验收。对照worktree无源码改动，main未移动。
- Staging原备份恢复门禁仍不PASS，未部署、未合并、未操作Production或真实业务数据。等待用户集中验收/另行决定既有阻塞范围。

远端team-access正确阻止旧Q09副标题等待。779cb3a7仅将该等待改为实际操作记录标题，继续验证合成报价事件/修改前后/关联详情，不删审计断言；owned Chrome沿已验证compact采用stdio=ignore，仍需实际关闭并清理专有profile。最新team8/8 PASS（24796ms），产品构建未改；旧CI失败保留，更新PR169再核实CI。
