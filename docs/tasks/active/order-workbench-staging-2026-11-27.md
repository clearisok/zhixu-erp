# PR178 修复、合并及 Staging 授权执行

用户在本聊天明确批准：修复PR178必要CI/Review问题、仅合并PR178到main、部署Staging并只读验收；不再重复请求上述批准。Codex转录用户决定，不冒充用户GitHub评论。不得部署Production、合并其他PR、改数据库/业务数据/Worker调度/清理/备份保留/网络；备份门禁失败、无法保留现有功能、需破坏数据库或修改其他PR时停止相关操作。

## 修复阶段 baseline

2026-11-27，feat/order-workbench，HEAD415a99c22007c668950edf6d861842e806fc73c2，dirty为空。已fetch main10b9a7d827e1c09f152ead58c21f26712d49a619及原PR分支，远端一致。source失败，team-access/baseline成功。仅一条未解决Review P2（PRRT_kwDOUKkHu868uXeS）：价格后续页失败时CSS按“没有table”隐藏上一页。没有其他阻断Review。Production workflow仅workflow_dispatch，普通合并不会触发生产部署。

source诊断经Codex CI provider取得实际head/check/annotations；job日志接口多次返回HTTP502，未回退CLI或假称取得完整日志。用户提供的1280/390超时和503 garment_read_not_connected、409 sync_catalog_not_ready作为待核事实；实际driver仍直接等待已折叠的“来源读取”。修复将逐宽度真实展开/读取/核对现有物料API/收起，保留原数据与布局断言，不提高超时或屏蔽HTTP/业务错误。503/409不能凭日志出现即判根因，完整本地/Hosted复核后追加结果。

价格修复只让成功加载的空第一页标记data-history-empty，按该标记隐藏空分页；失败页/非第一页保留原返回操作。新增真实51笔隔离调价历史、桌面/手机后页网络失败→上一页恢复→末页→上一页验证，保留未知请求/价格规则。

## Staging 保全方案（尚未执行部署）

实际公网build及Docker确认220ec86cb6cfa695c83ea474247bb01150075131 / staging-i174-220ec86c，project zhixu-quote-trial-i174-v2b，app image sha256:c0d84053c1dc89a2ce862c4da534e5f1e94d262923de6f933e84e8afeb193b61。源码包含PR176（Draft）及PR172/173，0061–0067已部署存储格式；当前Worker weaveops-catalog-sync-220ec86c运行，旧“Worker OFF”文档不能冒充当前事实。正式配置根/data/issue174-phase3-20261126b，原DB/对象/卷必须保持。

不能直接部署main旧后端。main只正常merge PR178；在独立部署集成工作树/分支，以实际220完整源码及新main合并提交形成候选，保留现有功能及0061–0067精确字节，解决仅工作台UI/测试/文档的交集；不更新176/172/173分支，不把其他PR合进main。若必须修改其他PR或无法证明保全即停止部署。

候选通过现有工程/发布及隔离兼容门禁后，读取实际Supervisor/policy状态，依原正式配对备份、完整性/恢复/正向cleanup/服务恢复门禁及trial.mjs流程发布。应用/网关镜像更新与原版本绑定按原机制，原业务库/对象/卷及调度/保留/清理开关不改。若正常流程不能在此边界内进行即报告，不绕过。部署前后比较关键业务只读摘要、迁移账本/权限及原其他模块；最终公网HTTPS、版本、DB健康、6233、历史与桌面/手机只读验收，不真实保存/采集。

本文件为恢复点，实际测试/合并/备份/部署/验收结果按阶段追加，不预写PASS。
