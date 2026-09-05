# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`65a0cac20991f0c6c2550ddbc7bcd9924377f065`

## Current Active Task

当前任务分支为 `feat/style-progress-material-control-v2`。Gate 1 的 Domain / Canonical Material / Expected Arrival Batch 非破坏模型升级已在 `2890041bcacae526cc80a518490b6043ddcc1383` 提交并推送；Gate 2 Parser / Repository / 数据生命周期 checkpoint 为 `84e309c7fb58ae879653bd497b2198cec7c0d7da`。全局 local data schema 为 13，Style Progress IndexedDB 为 3。

Gate 2 Parser / Repository / 数据生命周期实现与门禁已完成：Excel Parser 已改为 Header → Semantic Field Mapping；来源重导入保留 manual Batch、刷新 source-following Batch；厂供从 Expected Arrival、采购跟进、齐套、风险与物流 Projection 退出；Expected Arrival Batch 已进入 Backup / Restore 计数并使用唯一 OperationLog。最新真实《面辅料申购统计 (1).xlsx》只读解析为 17,384 条源数据、17,383 条有效、1 条尾部无效 Trace；D1935 / PI2607-235 为 261 条来源记录，厂供编码 `202608130002` 为 5 条、需求合计 3,809。原始 Excel 不得进入 Git。Gate 2 最终门禁为 TypeScript PASS、ESLint PASS、Full Tests 468/468、Production Build 29 routes PASS、`git diff --check` PASS。

Gate 3 Service / Projection 已完成：普通业务投影新增 Canonical Material Group，采购、入库、出运、出库分别从对应 Event 累计，客户名称不再回退 `sourceCustomerSnapshot`；厂供在 operational projection 入口即排除。Expected Arrival Batch 逐批且唯一复用 `material-logistics-service.ts` 计算推荐方式、预计到厂、最晚到厂、buffer 与 escalation；“距上线”保持独立自然日差值。多批摘要明确显示批次数、最晚日期、不同运输方式数量和最紧张批次，不以 first / last 冒充单日期。Gate 3 门禁为 TypeScript PASS、ESLint PASS、Full Tests 472/472、Production Build 29 routes PASS、`git diff --check` PASS。

本 Gate 3 checkpoint 推送成功后，下一步是 Gate 4 正式 V4 UI。不得在 checkpoint push 成功前进入 Gate 4，也不得 merge main。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
