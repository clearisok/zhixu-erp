# 50426受控执行工具工程

2026-10-28；`feat/closing-support-interfaces`，本阶段开始于23f1cd8dd1ec5f6f3ab983507df8edc35a8c6b83 clean，随后仅本阶段owned增量。前一片[只读预览](2026-10-28-cutover-preview.md)继续保留原来源；[本片回执](2026-10-28-cutover-execute/receipt.json)保存原CURRENT/INDEX/HANDOFF逐字及原件hash。

## 实现

`ops/quote-trial/cutover-execute.mjs`默认仅验证/重新观察；第四参数必须为具体预览SHA的execute确认。它检查预览完整性、main参数一致、十分钟时效、冻结ops路径、全新资源及观察不变，固定本机Docker Desktop Linux pipe。调用者仍须独立核对远端main并取得本次目标许可；工具和hash不授予合并/部署权限。

共享 `local-target-inputs.ps1`复用原新空目标的私密输入/证书生成；原通用new-local-target仍拒绝50426。Windows目录改为原子创建，已有或竞争出现的目录不接纳、不改ACL。生成配置与网段覆盖的摘要只留内存，每阶段核对，不输出凭据或配置摘要。

执行按原trial的check→prepare-local→init→objects-init→start推进，保留编译镜像、Compose、卷归属、空schema、HTTPS/对象存储验证。冻结ops逐阶段核对，启动前再查端口，生命周期命令受15分钟剩余预算及每次最多5分钟约束。check/prepare-local/init开始前均核时效；init已提交后不因过期重试，只完成余下有界步骤或停止。

尝试/完成回执采用CreateNew，仅在prepare已确认本次拥有目录后写入。准备失败或未知不向可能属于竞争者的目录写stopped日志；成功准备后还在内存保留目录dev/ino/birthtimeNs，每次校验输入及写日志都验证同一目录，替换路径不会转移归属。每阶段所有前检后再计算剩余预算，启动端口探测耗尽预算则不提交start。后续失败保留已创建资产并返回STOPPED_REQUIRES_REVIEW，不重试、清理、回滚、重置、恢复、停止旧服务或导入历史。

## 验证与限制

- 首轮相关ops45/45，含Windows ACL、既有通用准备器、新临时私密输入及真实Compose配置解析。之后原子目录竞争/通用入口仍拒绝50426负控2/2，启动回执负控1/1。
- 独立复审指出准备失败及准备成功后目录被替换时的journal归属缺口、端口前检后过时预算问题，均已修复。实际临时目录竞争/替换负控使用真实journal适配器，sentinel和目录逐项不变。配置改动、过期前不开始init、缺启动readiness、阶段失败/未知均有负控。受影响execute整文件由11项扩至12/12，随后只加强替换目录测试为完整execute/catch路径再跑1/1；源码未再变。最终定向lint/diff检查另按收口记录，分阶段原件保留，不把首轮45项冒称在最后修复后全量重跑。
- 这里只在唯一临时目录生成新随机合成输入，并执行Compose config解析；未执行真实50426工具、未创建/启动/停止任何容器或卷，未读写业务数据库/现有账号/真实Source，也未安装证书信任。并发外部变化仍可能让操作停止，本工具不构成全局资源锁。
- C2执行代码已实现，真实固定目标的全流程演练与人工体验仍未发生，不能写成实际切换READY或已接受。a198产品、90e镜像及原9项恢复证明均绑定原来源，本片没有重跑产品、SQL、构建、浏览器或恢复。
- 最终提交后精确发布守卫记录到 `outputs/approved-support-flow-20261028/cutover-execute-final-guard.log`；以实际checkedHead/exit为准。

独立最终静态复审确认上述目录身份与预算问题关闭，无剩余P1/P2；复审未执行测试/采集/Docker，不代表真实切换验收或许可。

## 下一步与交付

main沿用上次核实6479a713e2b80228f008049519ebbd50d10601a8，未重新查远端；PR131上次仍draft/head4584，兼容修复未送达。Git通道NETWORK_DEGRADED不变，本片push/PR写入/新CI为0；source原job仅增加新测试，不新增付费触发。

下一依赖仍为C0集中交付必要CI/复审及明确合并、C1最终main精确镜像、C3具体项目/目录/入口批准，再实际运行本工具并完成C4/C5。旧资产退役另行逐对象审查。完整Gate0尚未完成，不能因工具通过单元和配置测试而标Goal完成。
