# Gate8F：非空财务持久化恢复的分阶段工程证明

2026-10-27；branch codex/financial-recovery-fixture-main-869e，clean起点d68c25663ac42a8746e15f44f610653e7d6cba06。main869ee84dd0b31de6161011e4aa560678b244a64d沿用同日核实，无新fetch/API。Git/ref STOP_AUTH_OR_DIVERGENCE根因仍UNRESOLVED，本机Docker问题不解除远端停止条件。

## 精确来源

- S1/image：22fe4e84f08441f6a0c849540871e56b44d8aa9f，3088blob/0overlay；一次镜像构建81018ms通过，含前后端构建及运行器导入。镜像zhixu-persistent-financial:22fe4e84-20261027-d9b7f0d7ab，ID sha256:ad6cf01f17e34f0dc6cf2523f6526bbf440f67abaafa100e76e84f41121ea31e，45迁移文件/最高0046，不借原6d/最高0044镜像作新证明。
- S2/test：774264574191801147e2151b2b77ef5dc4d30f93，3089blob/0overlay；修正host夹具TDZ并补generator边界负控，生产TS/SQL/ops/依赖当时不变，复用S1镜像，不称S2镜像。
- S3/tool：545fe97ad1eb14302c2d87ae3b975b9434414a2d；safeFailure只检查非零子进程、有界64KiB stderr，已知Docker默认池耗尽短语返回固定code，不转发原文；身份错误优先，未知泛化。无SQL、业务权限、价格、关账或UI变化。

财务输入复用既有领域服务、Quote确认/可信后继、商业版本、关账预览/命令和原回执。FINANCIAL_RECOVERY显式依赖DOMAIN_RECOVERY，仅原持久化测试opt-in，无新账本/恢复系统、Hosted job或真实数据。

## 失败与隔离修正

[首次6项4PASS/2FAIL及TDZ](2026-10-27-financial-recovery-first-attempt.md)、[修后9项7PASS/2FAIL及启动失败](2026-10-27-financial-recovery-startup-failure.md)完整保留。S2非空财务、重启/冷重建和离线备份通过；恢复子项已走过启动前public全表/sequence比较及对象完整性检查，最后start失败，无最终DOMAIN诊断。不能改为9/9或补造已丢失内存快照。

原有界补start泛化失败；随后S3同目标一次独立诊断6439ms明确返回docker_address_pool_exhausted，确认当前失败。此前32网络/30bridge子网和缺ingress只是推断，不倒推全部历史失败同因。

复审拦住直接换archive路径方案，防止改变bind/configHash。保留S2全部tracked字节，仅在原ops目录wx新增两个唯一诊断文件：S3分类器Git blob、只替换该import的原CLI拷贝。唯一import回替逐字重构原CLI；明确2个extra文件，不称整个诊断runner为0overlay。原容器挂载的工具字节不变，应用镜像不重建。

仅为成功prepared的owned恢复项目缺失ingress指定10.253.244.0/28；18宿主/VPN活跃路由（忽略默认路由）与30Docker子网无重叠，启动前再次检查。原私密配置不覆盖，只另存TRIAL_COMPOSE_OVERRIDE变化的受保护副本。default网络ID/internal、服务/卷模型、五服务hash不变，无全局地址池/代理/TLS修改或旧网络清理。

唯一修正start于2026-10-26T21:48:44Z执行，27079ms、code0，COMMAND_SUBMITTED和READY/readiness PASS，无timeout/overflow/spawnError。300秒进程树控制、wx单次attempt及无自动重试保留。私密plan早期空ipam:{}比较、Mounts顺序预检曾拒绝，均发生在attempt前；修正只消除表示差异，身份/唯一挂载/卷归属不放宽，原件保留。

## 独立恢复读取

补验PASS，27本机HTTP＝1合成管理员登录＋15财务GET＋10回执GET＋1PNG，0领域重放。十回执证明恢复账本中的原UUID/command hash/result与HTTP一致，不冒称重新比较原POST内存。八表非空：closing_commands9、periods2、period_versions9、period_heads2、allocations3、allocation_versions3、allocation_heads3、labor_adoption_commands1。

- 2027-01显式13%税、手工1.125件、售价113CNY，成衣产值112.5CNY，locked与原商业版本保持。
- 可信后继明确4.25USD工价，原1.125CNY历史保留；新报价故意售价9999，订单仍113，不改旧关账。
- 2027-02显式0%税，经销7.25件和加工3.125件，总注册10.375；成衣819.25CNY、经销工价30.8125USD、独立加工服务0USD，无加工成衣销售字段。月份/数量不从累计生产20.25推算，无FX或自动收入。
- 原恢复合成管理员密码可登录，未重置；原PNG与固定字节及存储sha256一致。

结束仅停止恢复项目；三个owned测试项目15容器全停、12卷/私密输入/备份保留。旧55容器/183卷/29网络所选身份/状态/镜像/健康元数据及276旧refs changes=[]，不是旧业务内容或完整状态审计。原default ID、config及工具字节不变。合成dump zhixu-20261026T210547Z-bea28e4c.dump，SHA256 75ee18cff5873d358be4192b61dc4327890fa987c7f564a6db294c3e612be2eb仍匹配，不是正式回滚备份。

## 验证和剩余边界

S1 canonical控制15PASS/1actual-image设计SKIP；TDZ边界先红后7/7。S3分类先红，readiness/config/local-objects23/23及两文件lint通过。四工作树文件CRLF与Git LF仅文本等价，未声称字节相同；随后对精确S3分类器及原Git测试blob的仅import适配运行1项新增回归通过，不与23相加，字节仅比较收集器原拒绝保留。

独立只读代码、包装、网络修正及实际结果复审0新增P1/P2，审查者未执行测试/环境。原811项目、144发布负控、typecheck及其他构建保留原来源，不重复成功未变检查。完整HEAD精确main守卫后续另记，不预报PASS；新PR准备合并前必要完整检查保留。

这是原分阶段断言＋独立修正启动/读取的组合证明，不是新全流程PASS、用户接受或部署。宿主默认池仍满，未来全新本机项目不能假定默认分配可用；通用IPAM或旧环境退役另排。本次没有React/provider/导航，关账及USD采用具体UI批准pending，68能力不提升。0新Hosted/远端Git/ref写/真实Source/绑定/激活/调度/既有用户账号或业务库/merge/正式部署/切换/退役，完整Goal active。

## 原件SHA256

本机outputs/financial-recovery-diagnostics-20261027；原文/备份/私密配置不提交。

- source-check.json：c6abff1f3a3153bf1bb3ea86efcfe1a1c937f6d6decd6972651ce32467abfa21
- exact-regression.json：85d7555bfdd1409bfecc25de8f8d35f19727397e5e904a3f27b9a09b8a63c60c
- prepared.json：1fd5fb182dad3bc2b905a53788cdf29322b688469e3f9139298a9281fe41dff9
- start-result.json：f90ac087154977e6a969e82cf489019235a034c3639bdec9d9d1bb915eabb1d9
- network-observations.json：9d1f678c72632426871511026ea7ff95f498717a0daefb4b2bdeea951c43f14e
- network-plan.json：7d0a3f8b45db95d630c2bf03b24467d43bc9afceb54f860f1387ef6757408bda
- network-review.json：f09a1c523e2283cf9aafb1925916f5af686b83d0f7732313de0d4acafcc0a771
- network-start-result.json：0712314581e13041f8937cfab01f5cb66636cef9fcb4bb80a53fd8bcc58bf7d7
- financial-readbacks-result.json：adef92ecbb483640b8cede20cc77f6c0d5c63e4fffe5675f7f36848517c8f494
- financial-readbacks.json：e2a08e7b06f34d3d9995d5ca9f2dcf3449d839f70f3a984c6f8cc872b443438c
- readback-adapter.json：0a29ca2a593b7413b9ee3f7d92c8903c4b11d090a2ae431feb52e3b8b6f2d574
- preservation-final.json：731a37c74f45392066811bb5fefc4f82cda1529827abc4217036ba62ab85ed36
