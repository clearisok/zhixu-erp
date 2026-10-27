# Server关账月份计划：执行方匹配（D170）

2026-10-27；Gate8G2a，承接[D169月份计划](SERVER_CLOSING_MONTH_PLAN.md)。本模块保存数量片段的明确执行归属与生产观察证据，不另建价格、生产完成或财务账本。

2026-10-28前向工程：下文“内部命令/暂无HTTP”等是G2a当时切片，后续原月份HTTP/客户端已存在；D175增加显式view=display的非金额读取，详见文末，不将其当作新UI批准或完整归属恢复。

## 当前内部命令

`match_executors`与`move_months`共用0047的actor/request回执、版本、全局生产锁、fresh RBAC、CAS、事务审计和未知COMMIT恢复。只读及编辑仍使用既有closing/order/schedule权限；不因匹配数量授予任何金额权限。暂没有新的HTTP、导航或React接线。

输入仅为物理SO、expectedVersion、原因及明确选中的未分配行。每行填写真实assignmentId与数量，可保留未分配余量；不接受执行方类型/资源快照、颜色、月份、产品、价格、币种或Source数量。每一原行的全部量必须守恒，各颜色/月份量保持不变；最多100个结果片段，完整计划仍受2000行/256KiB限制。不能把未分配当成内制或按排单比例自动摊月。

assignment必须真实归属同一物理SO，其明确颜色须与月份行一致。已匹配行不能由此重配或搬移；原生产数量、实际完成、排单执行方及资源快照均不修改。当前Source数量/颜色变化仍明确阻断，等待后续显式对账，不自动回填。

**排单量与完成量仅为参考。** 超过参考量和已取消排单返回明确warning，不能因此限制独立关账数量或截断真实值。取消后参考量使用已登记的累计实际完成量；活动排单使用计划/完成的较大值供比较，不作金额或生产归属推断。

0048仅前向扩展0047版本：增加`executor_basis`（旧版本默认空数组）、允许新action并新增SQL约束。不重写001–0047，不猜历史执行方，不产生任何0045财务记录。首次匹配保存当前原assignment/执行版本、稳定执行归属及资源hash。再次给同一assignment追加量时，在新月份版本记录本次完整观察；旧版本不变，未选中assignment的依据不能刷新。普通调月完整保留原依据。

如果未开工排单后来合法更换颜色/执行方，已保存归属不跟着变。读接口明确返回`executorChanges`；预览和执行先返回`closing_month_executor_review_required`，后者保存原请求拒绝回执，不能让旧0047当前颜色约束触发SQL500。后续显式归属更正仍待开发；不把本命令冒称完整异常恢复。

预览hash同时绑定所有当前生产观察及warnings。预览后实际完成或排单变化须重新预览；新增版本、head、OperationLog和终态回执同一事务。回执丢失时核对原actor/request/hash，同一原命令不重复生成版本；仅撤销写权限且仍具原读取权限时，保留原回执可读，不能继续写入；撤销读取权限后也拒绝读取。

SQL再次核对颜色/月总量、已匹配行、Source指纹、稳定执行归属、本次所选当前生产版本及未选中依据不变。已有0045有效归属仍阻断调月/匹配，禁止将两套数量同时当作有效账。没有正式历史迁移、Source采集/激活、现有业务库/账号、部署、合并或资产退役。

## 验证与后续

合成一次性PG覆盖内外发/未分配、同单颜色、原版本证据、并发、生产取消/改色、COMMIT丢失、fresh权限、冻结、SQL负控及非空0047→0048升级；具体分源结果见[阶段](../tasks/active/closing-executor-matching-2026-10-27.md)。原失败记录保留，不借旧144/811结果冒称本片通过。

已批准的[关账调整具体UI](../tasks/completed/2026-10-27-closing-adjustment-ui-approval.md)不再询问。仍须完成Source变更显式对账、0045财务消费/冻结关联、全年两项金额和范围同步、原请求客户端、正式Server页面及旧写入口收紧，再做新镜像恢复和实际浏览器验收。现有旧HTTP、Browser历史和68项能力状态保持，完整Goal未完成。

## D175非金额显示读取

GET /api/v1/closing/orders/:id/month-plan?view=display返回原状态及带schemaVersion的display；无参数返回保持原样。单一RR只读事务和fresh既有权限覆盖所有依据。颜色分别显示不可变身份名和当前Source名，缺失/歧义不猜；执行方从原hash绑定资源快照提取名称，同一assignment更换执行方时旧basis与当前candidate分别关联，不用新基础资料名代替旧名。所涉月份含全部行和defaultMonth，状态明确not_created/open/confirmed/locked，不输出税率或金额。

行数、资源facts总8MiB与返回1MiB明确有界拒绝；显示路径在完整facts读取前按实际排单重复载荷检查，和后续去重标签读取累计共用8MiB。不创建稳定颜色、月份计划或其他数据。新monthDisplay严格客户端保持完整集合/owner核对和原session lease，不使用Browser回退/存储、不新增写命令。正式Source/匹配/USD三处UI仍待具体批准；旧归属漂移409不被读取功能绕过。具体验证及原失败见[读取阶段](../tasks/active/closing-month-display-read-2026-10-28.md)。
