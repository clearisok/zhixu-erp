# 恢复点：原PR126的main前移证据回归

2026-10-23；main`996dfedc12da3527343cd3ff2aa5eea35497e10e`。root唯一writer，reviewer只读。
当前原`codex/release-document-merge-guard`，从干净956921f63ba3069c059ca64c2324edbc33afefd8
继续，原branch不在其他worktree占用。仅工具/测试/文档；已知dirty为6份逐字输入归档、新
main advancement测试及本次状态/task更新，不能混入应用或其他候选。

先读CURRENT_STATE、原release-document-merge-guard任务及feature，实际check脚本与合成
Git测试。新red已完成7项0pass/7fail（66868.6335ms，预期反例），日志outputs/release-main-advance-20261023/red.log；
两类合法整合误拒绝，后置普通checkpoint删除side历史却返回[]。生产码尚未改，不能称修复PASS；
handle69204已终态，不再poll。reviewer已指出：只改base→HEAD会漏旁支
x；只在recordedAt为merge时检查也可用后置普通T洗掉全部side记录。拟定有界同路径H见证
+actualBase→HEAD真实merge走廊父清单逐对象保留；缺对象/清单/数量超限fail closed。
保持原mergeOf/锚点/blob/截图规则；需要独立正负Git回归和复审，不删除祖先约束。

原完整候选/Goal状态在归档94a1767b三摘要，原956摘要同目录另一子目录。94工具文档
已精确guard/远端；Release39816442442 success、attempt1/head94，watch11552已终态，不再poll。
Source0c三原CI39810661082/39810668692/39810675561也success，watch38441已终态。
新image8/8与发布116是原切片事实，不借作本修复PASS。所有ignored回执保留。

Full Goal active；standing安全Git恢复授权有效，不再逐SHA询问。无自动merge/close、正式
部署/入口切换、真实账号/业务库、退役或新Source额度授权。新固定真实恢复问题尚未回复；
若明确批准，须从干净树切到stable feat/garment-filter-recovery精确0c再执行一次，不能在
本dirty工具分支误消耗0HTTP许可。覆盖v1/原关账三问不默认，Num/outdate已确认。
