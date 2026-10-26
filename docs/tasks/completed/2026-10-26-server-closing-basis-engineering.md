# Server关账依据 Gate8A 本地工程证明

2026-10-26；不是关账闭环、远端交付、人工体验或部署证明。

## 精确源码与规则

- Branch codex/server-closing-main-869e；main基线 869ee84dd0b31de6161011e4aa560678b244a64d，本轮未fetch。源码 4bc68c6ecabcb3acc5541d0c4fc20aa850242ddf，parent 91ba595e815ced8887b0ebfe9356a1a6a4740997，tree 3c3bd0e9804a3ad16e0a54668f2021c329d6a307。它叠在已验收本地累计候选上，不冒称main已含本功能。
- D162记录用户五项确认：加工服务独立；USD工价门槛；未锁复核/已锁保留；期间税率显式确认；月份/数量/颜色/执行方手工确认。当前接口没有税额计算、期间或关账写入、确认锁定、USD工价采用、UI或入口切换。
- 只读RR与fresh RBAC、独立金额投影、精确commercial/processing-consumption、稳定颜色与原物理SO；归一历史alias拒绝，UUID大小写等价。累计完成不是月度事件，取消后产出保留。

## 实际验证

- 定向16模型＋8真实PG/可信HTTP子场景及父测试=25/25，9166.4689ms，0fail/cancel/skip。复审发现UUID大小写P2后修复并加实际正负控；独立窄终审0剩余P1/P2，不借先前源码结论。
- Canonical Git archive逐字核对3013个blob、0overlay，复用既有node_modules junction、不安装依赖。该归档根typecheck、Server build、changed lint通过；811项其余项目测试一次通过，21400ms。25项DB测试使用本地工作树相同已核对源码，不因归档重复建库。
- 工作树首次根typecheck被旧ignored outputs中的冲突TS阻断，Server build及全仓lint通过；首次全项目回归240940ms超时，未出最终汇总，保留未通过结果，不能累计其部分成功数。归档采用4并发且无旧输出，811项通过。
- 归档release组合20个responsive用例通过，但release guard测试文件因plain archive没有Git证据对象而加载失败（evidence_blob_unavailable）；原21/20/1记录保留。后续仅在有原Git对象的工作树补必要守卫测试，不重跑已过responsive/811。最终精确HEAD发布守卫另按实际回执。
- 业务表读取前后hash一致（鉴权session心跳明确排除）；本次只用新合成空库，未读真实凭据/Source。旧50/179/27及109条分支所选元数据保持；不冒称旧业务内容审计。

## 未完成及交付边界

完整G1–G8/R保持active。期间/快照持久化、幂等审计、确认锁定原子复核、明确USD工价采用、UI/用户接受与旧路径退役仍后续。本轮没有schema/迁移、旧环境写入、持续调度、真实来源/激活、合并、部署或Hosted CI。

PR130原远端61704afe22fe9fd0ea9f6625c6092fcbb9575dfc及其CI3/3保持原范围，本轮本地新增未送达。Git退出1的STOP_AUTH_OR_DIVERGENCE根因UNRESOLVED；用户早期普通PowerShellJSON只证明约5.35秒uncertain_transport，不能写成已证实TLS或同一根因。远端Git/ref写冻结不因新SHA解除。

## 本机原件SHA256

start.json：ad942577a19b514cf7b61ad31661fc53f4ee90f415b727c5f60deed867d85eae

source-checkpoint.json：3ac07ef5f82787951fb9898cf95c14d07df3887b02a87f7252ec1f018eb6ea6d

checks.json：2659f66ec3f260e7eefe6f4f2924605555f2773f5c17eeda4e32cbe3d6b42066

canonical-prepared.json：a5431d522fc918dd6c25c67aa6cdea8deed62b42763d38a3bc531d492320a870

canonical.json：1b7698e9fcc2a5095b206adb2fb98ced97aa40b3710a1a5c91dad396780bc0d7

preservation.json：510b3cd3f52994edf209d5694007982e63a8002fc26b36fa46df45a86519a748

原件outputs/server-closing-basis-20261026；源码归档446af94082f260e5948bc9cc63e6cafd1263ba33f82f6dbbbbbd3cf44369053a。[阶段](../active/server-closing-basis-2026-10-26.md)；[契约](../../features/SERVER_CLOSING.md)。
