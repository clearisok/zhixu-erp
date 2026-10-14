# Gate2 当前接力

2026-10-14；核实 main `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`。分支 `feat/order-commercial-versions` 依赖未合并 Gate1 `b5c7eb89dc25c397ebf342baa0607705abc80c89`。Gate1 已收口且保持 clean；普通 PowerShell 交付回执待返回，不改其 HEAD、不重复推送或建 PR。

Gate2 已完成两个本地工程阶段：基础 checkpoint `552e9b2de3f2809a1689594d43b997d12f1e9b2d` 的精确商业候选与不可变 schema；本阶段新增采用事务、请求幂等、订单 CAS、独立 head、原子审计、实时权限复查。沿用0015，新增来源确认时间；未回填真实价格。历史证据和详细状态见 tasks/active/order-commercial-versions.md。

本阶段17项一次性PG合成测试、server:build、typecheck、增量lint通过。验证两单共报价不共价格、单单换价、双重提交、来源变化、撤权、已完成订单阻断、审计失败回滚、来源版本删除后快照保留。新审计日志的自由文本原因在金额权限不足时隐藏。

本阶段已接HTTP预览/采用/读取及字段权限投影；旧订单CCT GET只读采用快照、PATCH统一409拒绝。18项商业测试、15项身份/升级测试及类型/后端构建/增量lint通过。尚未完成采用UI、报价侧新关联查询和CCT/PV确认写入权威一致性、历史只读预览、旧CCT回归修订及完整发布门禁；不能称Gate2完成或已上线。下一阶段先核对报价侧新采用关系，再接界面和历史预览。

仅随机tmpfs数据库，禁止真实账号/DB/部署/Source扩大。node_modules junction指向共享既有依赖，不删除目标。Gate1完整证据 tasks/active/evidence/order-identity/gate1-results.md。网络仍NETWORK_DEGRADED，仅本地checkpoint，不反复推送。

报价侧衔接已完成本地checkpoint：商业使用查询包含采用历史，legacy关联只写原创建关系；已存在CCT时禁止PV confirmation并行写，现存无SO CCT仍可报价维护；首次仅改一项金额保留PV另一项确认。19项商业/HTTP测试、类型/后端构建/增量lint通过。下一步采用UI、历史预览、旧CCT测试更新及完整门禁。Gate1仍待交付回执。

采用界面已接入（独立checkpoint，尚未浏览器验收）：server-order-commercial-card.tsx、详情替换旧编辑卡片；真实Server报价搜索分页/修订方案选择/差异预览/明确采用；不确定提交保留原请求重试。6项客户端测试及类型/lint/Server构建通过，最后executionOnly显示调整后需重建。下一步优先合成浏览器测试、历史预览及旧CCT回归，不能直接PR交付。UI精确路径记录在Gate2任务文档，正式门禁清单待整合。

浏览器/历史预览阶段已验证：4项Chromium+合成PG采用流程（桌面/390px截图已目视检查）、20项商业领域/HTTP（含明确范围只读cutover-preview）通过。新增脚本test:order-commercial、test:order-commercial-ui。下一步必须处理旧共享CCT测试与新规则冲突、七角色回归、完整测试及release-baseline/UI影响清单；不要误称Gate2已交付。当前所有测试容器/浏览器已退出，截图在ignored outputs/order-commercial-ui。历史预览仅在合成库调用。

七角色与部分旧CCT回归已对齐：order-commercial-roles 8、linked-commercial-terms 9、commercial-terms-security 20 PASS；类型/lint通过。保留原锁等待/回滚/权限测试，只将旧Order共享语义替换成Quote合法确认和Order显式采用边界。confirmed-commercial-terms主集成（约480行）及其他商业读取/UI测试还没更新，下一轮继续。npm test整体日志 outputs/gate2-project-tests.log。

本阶段npm test完整源码回归817/817 PASS（初次815/817，两条废止共享UI静态断言已更新；14项相关源码测试独立通过）。这不包含尚待修订的PG商业主套件；日志outputs/gate2-project-tests.log。
