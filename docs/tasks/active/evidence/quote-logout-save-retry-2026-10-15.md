# 报价保存与退出重试：工程验收与复审

核实日期2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；修复源码65566527b15c1ffd78715389d7c34db0e867b300。本文件冻结，不覆盖旧截图、测试报告或分支。GitHub为实时工程事实源，后续代码/交付/CI/人工验收变化另加附录。

## 已确认的问题与修复

在既有68ac1fc9f839ebfc894d39377dac221e7f65566b源码上，新浏览器用例复现：
- Quote保存已ACK但退出失败，重试“保存并退出”再次发Quote PUT。该观察只证明多余请求，不用即时版本读取推定重复业务落库。
- Quote保存结果未确认，点“放弃并退出”仍离开到/login，绕过原显式核对保护。

修复只调整两个handler。已确认保存且当前无新dirty时仅重试退出；后续新编辑仍需保存。保存待核对或成本同步未决时，阻断丢弃离开，沿用显式重读核对。没有重设计UI、修改DOM结构/CSS/报价计算/CCT/SQL/权限/账号/Browser持久化或路由开放。V1记录为已有保存/退出保护的恢复，不是新交互模型。

## 测试

- 真实Chromium＋一次性随机PG：13/13。旧十场景保留，含七可信角色、订单/物料、响应式、来源轮询/失败清屏、关闭的生产路由和无Browser回退。
- 已保存后连续退出失败：只1次Quote PUT与1次版本推进；继续编辑后第二份dirty正确增加新版本，最终退出不再保存。
- 保存网络失败：不重复PUT、不logout，仍在详情，保留内存草稿与可信会话。此用例在请求送达前模拟网络失败，不冒称另测了服务端落库后ACK丢失。
- 测试等待每一次新的logout失败回执，避免旧Toast造成“本次保存完成”误判。最初修复后这处同步断言曾误判，修正测试等待后全部通过，没有弱化业务断言。
- 112/112前端认证/报价持久化测试、typecheck、Server/session/snapshot候选构建及定向eslint零警告通过。
- 精确main源码/证据守卫于65566527b15c1ffd78715389d7c34db0e867b300通过：11页面/35能力/53项继承UI路径。94基线回归属于既有B2阶段，本次未冒称重新运行。

构建build-info.gitCommit为68ac1fc9，buildId20261015-173118；当时工作区已含本次TSX修复。655665提交中TSX与该构建输入相同，记录下方SHA而不把构建标记冒称未修改的68ac源码。没有新增截图或人工像素/业务验收；旧PNG/hash不动。

## 复审与交付限制

复读requestPersist、persistQuote、成本同步完成后的离开路径，确认未把重试优化放到公共finishDeparture中，因此不拦截正常保存ACK后的离开，也不跳过新的dirty。未知保存仍由既有serverError/persistence阻断重复写入；本次补齐丢弃入口，未新增自动重试。未发现本次补丁新增P0/P1；这是工程复读，非用户业务验收。

分支fix/quote-logout-save-retry从B2 68ac起；原feat/server-quote-to-order@a0e60e4e83cf67bfa22c36234c5dd9bf4495689d完整保留，原工作树无运行源码挂载后才复用。独立PR需以已交付B2为依赖或等依赖合并后对齐main，不能把累计G1–G5内容作为小修直接合并。Git传输仍TCP失败，本分支无远端交付/新PR/Hosted CI；不自动合并部署，不动既有演示、真实数据库、账号、Source范围、宁波或18443/18444。

AI建议：按已有109→110→111→112及G5依赖顺序复验交付；恢复Git传输后再创建唯一小修PR。待确认仅最终远端CI/人工验收，不需用户重做本轮已完成的业务调查。

## 本机校验值

- features/quote-center/components/quote-editor.tsx — d1c823def37b984f6321c9c8a5821647d4c88cc710601a27187988da2a277035
- server/integration/ainuoke-continuous-ui.integration.test.mjs — f0512cdc0044d9ff4fe067ffcd80b3d246e8c1de63d5b351b5ddd5a61b5b52db
- outputs/quote-logout-before-ui.tap — e386f4b4a0a2041c89411b8f3f758fdb6369c93e963dbb8d333a99651cb36587
- outputs/quote-logout-after-ui-final.tap — 4ac0cb9acf80e323e6be82943525b4b7525ca73afb5214da82ed40724b2c39f4
- outputs/quote-logout-persistence.tap — 921fb651e2b86e429f70e4053669b7d7084972502b807fa2e3d8517639d7a021
- outputs/quote-logout-baseline.log — 76f919a33cd54be2c026b0e3611885d813774d1728f324e86db64d6858ad6ab8
- outputs/quote-logout-lint-final.log — e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
