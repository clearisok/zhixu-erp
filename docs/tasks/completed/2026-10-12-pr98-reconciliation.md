# PR98 冲突与方案修订

核实2026-10-12；main `9ebdf3b46b471e227e86a86c36f705e7ac6e6908`。起始branch chore/ningbo-readonly-preflight，HEAD `f1f67f722d40f19fe10c8cbfc04e358a2b8340a8`，工作树clean。用户明确授权修复冲突/过时方案/失效链接，CI通过后合并。随main/CI/交付变化更新，不改历史观察时间。

- 合入上述最新main，4个冲突为AI_HANDOFF/CURRENT_STATE/PROJECT_INDEX/release baseline。取最新main事实，保留main全部冻结证据和PR98两条原证据，不退回旧能力状态。
- PR102于2026-10-12T15:37:42Z按用户授权合并，head bae008451a55da071c4b1eaf9b4b12d3b2ae011c，merge为上述main；source/team-access/baseline三CI成功。只读准备能力已合并，真实Source仍未连接/未部署。
- 上线方案按D105改为来源真实四流持续展示后才上线宁波；当前ledger包含0012，原现场0001–0007及当时main0011保持历史事实，不冒充本轮现场复验。新增合同/主色镜像增量等限制保留。
- 修复迁移到tasks/completed后的相对链接，覆盖GitHub review discussion_r4245803857；不改归档正文的历史日期/SHA/结论。原现场快照与observations.json字节保持。
- 用户本轮明确长期接受当前艾诺科HTTP风险，代码实现独立进行；本PR不修改采集器、安全开关或凭据，不执行真实账号/DB/部署。原文档HTTP约束属于历史代码基线，不当作用户仍未作决定。

验证：只需文档链接/冻结证据/实际main基线与71项门禁；产品代码相对main无diff，最新三CI成功后才合并。最终运行链接由PR98记录，不将旧CI当作本轮结果。没有UI/SQL/真实环境修改。
