# Gate2本地合并前复审

2026-10-14；reviewed HEAD f1c68a3597060125185d77b0ac839a8b8e999376；最新核实main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。比较基线为本地Gate1 def98f275c2ef61712008891ab1c60d308981bb7；这不代表远端已合并。由主执行者另轮复读实际diff/SQL/API/UI及测试证据，非外部独立审查人。

## 复核范围与结果

- 创建历史/来源：Gate2不新增SO创建路由，不修改旧创建字段。Gate1基础来源读修复已通过本地merge保留完整历史；merge相对第一父提交只有三份文档变化，运行代码和测试字节未变。
- DB0015：版本append-only、订单/version唯一、actor/request唯一、head匹配同一订单及同一版本；no-delete防误删。无Quote FK可独立保存已采用事实；真实迁移未执行。
- API：trusted session与mutation boundary；fresh DB grants；认领/业务类型/生命周期；来源fingerprint、Quote/CCT锁、订单CAS；exact retry不重复写，撤权重试阻断；审计失败全回滚。
- 旧入口：Order CCT写命令统一拒绝，GET仅采用快照，无值不回退；Quote CCT仍可确认。新采用关系不伪造创建来源。已有CCT阻断第二套PV确认写入。
- 商业事实：理论/实际数量不在此Gate改动；零与未知分开，processing售价null；已采用快照不随Quote变化，源PV删除仍可读。软删除Quote不得新采用已修复。
- 权限与UI：字段白名单与金额分项投影；缺任一金额权限隐藏原因/指纹；七角色合成覆盖；实际浏览器精确选版、预览/采用、重试请求保留和手机Modal；未改变其他页面。
- 历史预览：精确1–100 UUID，READ ONLY REPEATABLE READ，原始价格not-proven；不回填/不扫描真实库。
- 证据门禁：前向版本链有基线锚点、所有中间blob核hash、反向场景阻断，不覆盖旧D121/D122记录。source UI路径9项，能力17项分维度，最终提交门禁需复验。

## 已发现并修复

旧schema读取认领表导致首绑/旧交付升级失败；软删除报价仍可供采用；旧Order共享测试绕过新语义；迁移与权限断言过时；证据链只能一跳。分别由代码修复和负向/完整回归覆盖，未靠恢复废止行为或跳过测试。

## 合并结论与限制

本轮复读未发现新的P0/P1代码阻断。可以继续Gate3本地依赖开发；不建议现在直接合并：Gate1/Gate2远端精确送达、唯一PR及CI均未核实。先交付Gate1，再将Gate2 PR基线对齐最新main并跑精确门禁/CI。CI配置已包含商业及全PG和浏览器。

证据：完整PG261、商业29、身份15、浏览器4、基线78及构建/类型/lint分阶段PASS，详见gate2-results.md。完整Server关账、历史真实价格恢复、加工批次、双入口、历史归一、新来源不属于已完成能力；没有真实部署/账号/迁移/Source扩大授权。

Gate1原独立全套254/255后修复剩余迁移期望并12+7重跑，原始事实保留gate1-compatibility-followup.md，不冒称同一轮全绿。UI人工验收仍待用户；旧应用回退兼容性不能假定。新能力关闭命令时必须保留已产生身份和版本。
