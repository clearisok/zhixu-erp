# 恢复点：Gate8C USD工价采用核心 checkpoint

2026-10-27；当前分支 `codex/order-usd-labor-adoption-main-869e`，父提交 `f080263ab681afdb79b20df3200ca027a96ec234`，最后核实main `869ee84dd0b31de6161011e4aa560678b244a64d`（未fetch）。本阶段无继承dirty，当前增量全部本阶段创建，见[阶段](tasks/active/order-usd-labor-adoption-2026-10-27.md)及[契约](features/ORDER_USD_LABOR_ADOPTION.md)。

D162/D164：PV确认保存确认时币种，已确认PV不能直接改币种；原Quote/固定PV/可信后继/相同产品的USD工价显式采用，只追加原商业版本，不改source/product/sale/batch/closing。0046、窄工价HTTP/preview/commands/receipt/history、fresh权限、CAS、幂等、原子审计和未知COMMIT。核心模型8与集成13通过，Server类型通过；完整边界、root工程、发布门禁和独立复审尚待，不是Gate完成。首次失败原文保留，不冒称全绿。

原Gate8B f080已完成本地验收，106定向/811项目/144发布，详细证据[Gate8B验收](tasks/completed/2026-10-27-server-closing-commands-validation.md)及[澄清](tasks/completed/2026-10-27-closing-command-evidence-reconciliation.md)保持。本阶段不得用其结果代替新源码验证。

STOP_AUTH_OR_DIVERGENCE原push退出1根因UNRESOLVED，远端Git/ref写仍冻结；0新Hosted CI/真实Source/现有库/合并/部署/切换。旧环境与111旧refs保护，Goal保持active。下一步：扩大负控、独立审查、精确源码收口，随后报价工价采用与关账UI。
