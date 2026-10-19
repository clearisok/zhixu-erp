# Phase A 检查器失败与修复回执

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；产品合并f810f073ce3303217484325d7acd934142db5aa8，前向证据checkpoint2e056e48897b08cf43d0c48bdf01eaf20cda0033。

完整root首轮876项：874PASS/2FAIL；独立基线首轮94项：93PASS/1FAIL。失败完整保留在ignored本机回执，原Phase A报告不覆写。

1. 报价静态契约用后一个未保存Modal的精确字符串作截断边界。增加pendingLogout后该字符串不再相等，slice读到文件末尾，误把后续销售单价当作价格版本弹窗内容。现用现有TypeScript parser选取open=Boolean(versionModal)的唯一真实JSX Modal，并在该节点内验证名称/数量/说明与不得出现销售单价。没有删断言或改报价字段。
2. 新增证据根同时触发同commit非法替代和未锚定。守卫在前一个条件提前continue，仍以EVIDENCE_REVISION阻断，但漏报EVIDENCE_REVISION_ANCHOR。现提前拒绝分支同样分类未锚定文档；所有失败仍阻断，不改变合法链规则。

定向复验：报价8/8、新根1/1PASS。最终root、完整94基线及精确门禁在后续重新执行，不将定向9项冒称全部验收。无产品UI改版、真实数据、部署或远端操作。

## 完整复验（b2918fae）

修复后root876/876、独立baseline94/94通过；完整类型、Server编译及源码lint 0错误0警告；显式Server构建source b2918faeeb7a97df6ece4176d7c3275f27b51728 / buildId20261015-120039通过。Source持续70PASS/1Linux skip、完整PG261/261、身份/商业/加工/归属专项81/81通过；20浏览器仍按原4bdfa830+Phase A工作树构建范围记录，未冒称在最终提交重跑。产品组件在f810f073与b2918fae之间无变化。G5 Phase A本地完成，远端仍PENDING；B1页面另阶段，不据此宣布整个Gate5完成。
