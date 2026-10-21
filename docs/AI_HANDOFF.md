# 恢复点：原始历史收口，保留真实来源和关账边界

2026-10-22；chore/server-candidate-history-integration，独立 main 996dfedc12da3527343cd3ff2aa5eea35497e10e。实际本机 no-ff merge e6ba5f049dd7fe835e8025a7fa6280585923ff34，按序双父级 7ac59413d5b55b0aa31962f6952a8c635b166c38 / 956921f63ba3069c059ca64c2324edbc33afefd8；八个PR120–127原head祖先全部已核实。1287非doc树条目、manifest原blob/261证据/55能力/全部状态均与7ac一致；213 incoming、6摘要归档及3历史doc完整。root唯一writer，既有reviewer只读，无继承dirty。阶段[事实与边界](tasks/active/server-candidate-history-integration-2026-10-22.md)；最终文档HEAD/guard/clean读ignored outputs/server-history-integration/checkpoint-final.json，不推测不存在的回执。

精确e6ba/main996守卫PASS；发布/响应式116/116、零失败/跳过/取消（195593.4372ms）。独立复审无P1/P2。7ac三个实际CI各一次/attempt1均completed/success：source39673330905、team39673338812、baseline39673344242。不要重新dispatch同一7ac，或将其标作e6ba/后续文档HEAD的CI；应用/tool/test/SQL/UI/workflow不变已由全树比对实证，本次没有重跑其他业务/镜像/浏览器检查。

7ac远端exact，原exit1/STOP仍保留；随后原工具DryRun DELIVERED_VERIFIED/pushes0，无重推。7ac/a296完整stderr字节/hash与固定可信目标标准模板精确匹配，确认目标引用已存在；谁在哪里并发创建仍unknown，不称永久网络修好。a296 tracking已一次非force fetch补齐；诊断observer隔离失败P2已修、5项离线用例通过，原工具策略未改。所有原始安全回执留在ignored outputs/git-reference-diagnosis；新历史验证引用交付另读本phase回执，不覆盖旧STOP。

无累计实现PR，无GitHub合并/关闭/部署或旧环境升级。3001/50426/59069/62426等保护，62426仍8175旧镜像；0真实Source/凭据/候选/业务DB操作。用户Num/outdate确认已由D152承接，不重问。固定C1/C0/C1额度及三项关账业务问题尚未回复，不默认；可以继续独立工程，但不越过真实核验、业务决定、入口切换及退役授权。Goal保持active。
