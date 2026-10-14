# Gate4 案件/预览阶段冻结工程证据

核实2026-10-14。最近核实GitHub main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`，本轮未刷新远端。分支feat/order-normalization-preview，父基线39c9f7b607eabed5d72845d3a30b7fc766a6ee9d（未合并G1/G2/G3）。最终生产源码候选e07c33c71ff44796899189fda7ac6493ebfa4fce，显式Server构建20261014-223207/gitCommit=e07c33c7。本报告在提交后按Git blob冻结，后续变化使用新证据，不能覆盖此记录。

## 已验证工程事实

0017唯一规范SO对案件、append-only opened/review_note/withdrawn/reopened事件、严格版本顺序及请求身份；旧SO/原来源/流水保持。可信session和fresh受信管理员+order.view；写入授权行锁。开案服务端RR重采集对比预览；同请求幂等、不同payload冲突、同pair防重；追加expectedVersion；案件/事件/OperationLog原子提交。未知保存及临时并发冲突保留原请求。撤回不删除案件或取消SO。

预览v2保存有限订单/合同身份和基本事实、固定引用计数及每类前100ID。合同号/业务款号/工厂款号分别保留；来源读取时间和案件采集时间独立。排除raw source_metadata与商业价格。新未知直接FK保守报告；未覆盖Browser/外部生产/财务时unavailable/null，不填0。摘要仅有限事实，不是执行token。旧v1事件缺新合同字段时仍可展示原证据。

现有Server订单中心管理员Foundation Modal：搜索分页两单、对照、带原因开案与记录/撤回/重开、分页历史。无新页面route或归一执行按钮；原列表/物料/报价布局保持。普通物控无入口，API实际权限独立核查。

## 验证记录与范围

|检查|实际结果|证据|
|---|---|---|
|案件/预览/schema/HTTP领域|37/37通过，最终合同事实补充后|server/sales-orders/normalization-assessment.test.ts、server/integration/normalization-*.integration.test.ts；本机outputs/gate4-contract-facts-tests.log|
|浏览器|5/5通过（4子场景+fixture）；来源字段、响应丢失+临时409、证据变化、手机历史/非管理员|server/integration/normalization-case-ui.integration.test.mjs；outputs/gate4-contract-facts-ui.log；候选e07c33c7|
|完整源码|824/824通过，766c68eb收口内容；后续新合同查询/展示另经37/5验证|outputs/gate4-final-source.log|
|完整PG|261/261通过，766c68eb；后续无schema/旧业务写入变更，仅新增只读合同事实经37项验证|outputs/gate4-final-postgres.log|
|发布基线回归|78/78通过，前向D124证据补修后|outputs/gate4-final-baseline-tests.log|
|类型/lint/编译|完整类型/完整lint/Server编译通过；合同事实补充后完整类型及修改路径lint通过|TypeScript无缓存检查；outputs/gate4-final-lint.log|
|显式Server构建|e07c33c7通过；server/master/writable/session/snapshot|outputs/gate4-contract-facts-build.log、dist/client/build-info.json|
|像素查看|1440桌面及390手机图片已查看，无横向溢出；非人工业务验收|outputs/normalization-ui/case-preview-desktop.png、case-history-desktop.png、case-history-mobile.png、case-evidence-mobile.png|

outputs及dist为本机Git忽略产物，不上传真实数据或取代历史截图。最终源码门禁/能力登记在本报告冻结后的阶段复核，精确HEAD见premerge-review的后续记录。

## 已保留失败与修复

首次类型缓存EPERM改用tsc --noEmit --incremental false，未改共享权限。严格类型/BigInt编译目标及合成测试异步语法修正后通过。HTTP测试漏既有X-Zhixu-Request头修复客户端，未放宽服务端。

浏览器早期tab未渲染/fieldset禁用等待误判，按真实:disabled及出现条件修正；原成功请求遭临时409继续保留的实际产品边界已补负向场景。首次源码817/824、基线71/78的7失败均D124文本前向证据未登记，添加新supersedes节点后通过，旧hash不改。首次全PG238/243及5失败（含父fixture）为四处显式迁移清单缺0017；修正精确列表后相关50项及全PG261项通过，旧业务断言/SQL不弱化。

## 不代表完成的范围

REMOTE DELIVERY PENDING，无新PR/远端CI/合并。人工验收not-run；真实数据库/账号/Source范围/调度/宁波/18443/18444未操作，sourceActivation本模块不适用。任何当前环境镜像身份仅沿用历史记录，未重新观察。浏览器测试仅合成账号/一次性tmpfs/临时profile。

整个Gate4仍未完成：有效归属执行、跨读取/Source刷新统一解析、双边流水保护和纠正恢复必须独立工程。当前数据覆盖不足不能批准任何真实归一。真实案件需具体目标、完整引用、生产/财务核对、备份与纠正方式并另获授权。G5页面/排序/新来源仍待独立交付。

更新时机：新的代码/测试/规则/远端/运行证据产生时，以新冻结文档前向替代；本文件不回改。
