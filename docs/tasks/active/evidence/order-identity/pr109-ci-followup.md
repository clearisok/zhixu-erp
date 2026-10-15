# PR109 Source CI 与页面 key 查漏修复

核实2026-10-15，main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；分支feat/order-identity-and-contract-claim，修复起点def98f275c2ef61712008891ab1c60d308981bb7/clean。PR109初始远端head精确核实；不自动合并或部署。GitHub是实时CI/合并事实源，本文为此修复阶段快照，后续以新提交/CI记录更新。

真实CI run38659703949 Source失败13!=12，定位ainuoke-server-source.integration.test.ts:51。旧样本仅排除0012却把0014带入，未真正验证0011→新schema。修复为旧库精确1–11、当前精确1–12/14，保留账号public_id/password_hash不变及双重runMigrations幂等断言；不动态放宽任意迁移数，0013未发布不虚构。

本机Source21项：20PASS、1Linux CLI子场景在Windows按既有条件SKIP，exit0；Python固定catalog loopback实跑。LinuxHosted仍待此PR最终CI，不将Windows结果冒称Linux验证。原head完整test:postgres本次重跑261/261通过（先前255为旧时点描述），与独立Source套件分别记录。

后续分支真实浏览器还发现详情多个相邻组件共用scopeKey会重复挂载；本Gate1两处按identity/materials语义前缀独立，不引入后续G2–G4组件。认领/准备保存/刷新、管理员转交与1440/390浏览器5/5通过，补唯一认领卡片断言。现有Foundation/布局不变，无源码/UI截图baseline覆盖。完整类型、改动范围lint和显式Server静态候选构建通过。

本修复不改业务创建规则、SQL、数量、价格、账号或Source激活；G1共享CCT仍需Gate2后续隔离。已批准计划范围内修复，不把后续Gate视作已合并。精确新head/发布门禁/最终CI另核实。

本修复候选check:release-baseline按完整main64实际PASS，test:release-baseline71/71。最终commit后精确checkedHead和远端三项CI仍分别核实，不将候选说成远端已通过。
