# 50426只读切换预览工程

2026-10-28；`feat/closing-support-interfaces`，开始基点995a3696884f7e55c3f168b16f6d4a085308f498 clean。沿已批准Gate0推进C2，不执行切换。[机器回执](2026-10-28-cutover-preview/receipt.json)保留原状态逐字内容、原件hash、失败及实际验证范围。

## 实现与边界

- 新增 `ops/quote-trial/cutover-preview.mjs`：固定HTTPS/127.0.0.1:50426，只读本机Docker Desktop Linux、固定端口/路由、Git对象和冻结ops文件。明确拒绝远程/其他Docker上下文及环境覆盖；Git子进程禁止lazy fetch。120秒总预算、10秒单命令、4MiB输出及有界文件遍历，失败停止且不回显外部stderr。
- 校验全新目录/项目/卷/网络、不可变镜像身份与精确ops文件，给出观察指纹和10分钟有效期。源镜像非调用者已核main、端口占用、未知范围等阻断。调用者main不是工具远端验证；标签不是编译身份验证，执行前仍须原trial检查和新观察。
- Docker配置自动端口的空字符串与实际分配分开，运行容器按容器端口/protocol及非空HostIp逐条对应。停止容器仍保留，不因无监听判定可删。
- 复用原网段算法，抽到 `ops/quote-trial/subnet-policy.mjs`；原fixture重新导出，算法不改。既有source CI job增加两份测试，不增job/触发器。本片没有执行GitHub工作流。
- 没有execute模式、配置/凭据写入或容器创建/启停；原new-local-target仍拒绝50426。守卫执行工具、最终main镜像和实际切换许可仍未完成。

## 实际验证

相关ops测试48/48；随后端口关联加强的受影响定向测试3/3。二者分别保存，不声称48项是在最后加强后全量重跑。最终四文件eslint及diff检查通过。独立只读复审提出的远程daemon、lazy fetch、遍历预算和端口关联问题均修正，最终无剩余P1/P2；复审没有运行采集或测试。

第一次真实只读预览因合法的自动端口配置空值遭过严校验而停止，原失败回执保留。离线修复与负控后仅补一次：完整预览返回BLOCKED，唯一阻断 `image_source_is_not_verified_main`。这是候选a198与已核main6479不同的正确阻断，不是环境已READY。74容器、199卷、37网络仅被观察；runtimeWrites=0，目标目录未创建，未读业务库/Source/凭据或改变旧运行资产。

本片无TS/React/SQL/UI变更，未重复a198产品/浏览器/数据库/镜像恢复测试，也未重跑旧CI。最终提交后精确发布守卫记录到 `outputs/approved-support-flow-20261028/cutover-preview-final-guard.log`，结果以该实际回执为准，不提前记PASS。

## 交付

main沿用上一片6479a713e2b80228f008049519ebbd50d10601a8，本片未刷新远端。PR131上次核实仍draft/head4584，兼容修复未送达，NETWORK_DEGRADED不变；无新Git上传、PR写入、合并或部署。C2只读部分完成；后续仍按C0交付/必要CI/复审和明确合并、C1最终镜像、C2受控writer、C3具体切换许可推进。旧资产退役单独审查。
