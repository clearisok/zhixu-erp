# 当前状态：本地发布组合验证，尚未晋升main

2026-10-29；此处是 `codex/staging-release-local-integration` 的本地组合验证，包含 #132@015dec7409e6109b9adbd638624d28dfd6ebc7f0、真实来源文档 checkpoint032c553fc4ec2f30e9d4e8402e2ee86d3393c8e5 及 #133@3c481949b9f13306f7901f63cde213f27ccc8370。远端 main 仍是5c8cb8037376288aa71043e799a057e21f1b985d；没有合并 main、更新两个 PR head、构建新镜像或部署。最终 HEAD/工作树及守卫另查。

- #132的双Origin受控配置和#133的归一退役大小写修复均保留原文件；本地仅解决状态文档/发布清单冲突。两边产品互不覆盖，既有证据全部保留。
- #133的三项必要CI首次通过，#132三项既有CI通过；组合HEAD没有新的Hosted检查，不能借前件状态声称它已通过。当前运行80ff镜像仍不包含这两项。
- 真实两合同的订单/颜色尺码、三代物料四流及两份货款快照已经保留，有限窗口结束。成衣固定证明尚未批准/执行；生产和关账仅有合成闭环证明，不伪造真实执行/收入。
- 本机staging Origin十项协议断言已通过，原失败和自有环境安全停止回执保留。宁波只有现有Tunnel形态只读证据；尚未部署或切路由。
- 待具体合并批准后再整合实际main、冻结最终镜像和具体部署单。没有自动merge、部署、新真实采集、旧账号/业务库写入或旧资产删除。

[本地组合说明](tasks/completed/2026-10-29-local-staging-release-integration.md)区分本片验证和复用结果。

## checkpoint032原状态（历史，保留原文）

# 当前状态：main镜像已恢复，两合同真实窗口完成

2026-10-29；产品源main **5c8cb8037376288aa71043e799a057e21f1b985d**。仅#131已批准merge commit，双父6479/e94及原树核实，历史保留。当前codex/real-source-acceptance文档checkpoint，HEAD/dirty由Git核实。[本片事实](tasks/active/real-source-acceptance-current-2026-10-29.md)及前件[镜像/配置](tasks/completed/2026-10-29-main-image-staging-profile.md)、[本机目标/工具](tasks/completed/2026-10-29-main-local-target-and-source-tools.md)保留原日期/失败/hash。

**工程交付**：精确main80ff应用、非空备份恢复9/9；D178配置26+30定向、发布182/182、015精确守卫及独立代码复审通过。#132远端015dec7409e6109b9adbd638624d28dfd6ebc7f0三项自然CI成功，仍草稿未合并。此后GraphQL/REST两次只读元数据EOF，无重推/重跑CI/共享代理或认证变更，merge前重核。新文档head不借旧CI，不为记结果反复push。

**真实窗口已完成**：用户独立批准新目标54315两合同首绑/颜色尺码、物料初采+两次五分钟续刷、独立6086941目标及一次采集。626568ms内完成2 SO、有效尺码矩阵、3代/6物料快照、2财务快照（12/9行）；初末SO/颜色相同，snapshot API全200。四流/单位独立；货款申请不等于银行实付，mappingVerified=false。实际库Quote/生产/关账事务0，原创建生成默认月份计划2。

**窗口停止**：合计可证明≤5登录/112报表/117HTTP，主容器exited/0，无持续调度；时效600000ms不变。只新应用财务snapshot开关重建一次，五服务健康。过期后“查看历史物料来源”每单3次及9/31行可读，不冒称当前。只验证本机CA/主机名和新local.admin登录/注销/API，没有系统信任安装、浏览器或人工接受。原件/备份保留在新卷及目标owner-only证据目录，不入Git。

**下一步**：6086979固定D1933→唯一C1/C0/C1的原工具已冻结，2667 blobs及无网络/私密路径前置通过，真实请求0；新具体许可待确认，不能猜合同或借旧额度。#132新merge、对应最终main镜像、公网TLS/Host/cookie/附件及人工业务接受仍待，staging未就绪。原7bf3现仅依赖链接，未恢复/覆盖；完整本工作树和持久新目标可用。无宁波部署、旧库/真实账号修改、50426切换或旧资产退役，完整Gate0–8/R继续。

**新增发布准备**：[本机 staging 协议及宁波 Tunnel](tasks/completed/2026-10-29-staging-origin-and-ningbo-route.md)记录十项实际协议断言通过，收尾适配器误用不存在的 stop 操作另留失败并仅停止自有五服务，四卷保留；真实来源环境不变，新增 Source 0。宁波只读确认 active cloudflared、未发现 nginx/caddy，呈远程配置形态；具体路由仍未核实，不新增代理层。完整 Gate 表区分已有合成工程、真实来源、人工接受和发布边界；无新上传/CI/部署。

**旧写边界与恢复依赖**：[本片核对](tasks/completed/2026-10-29-server-write-boundaries-and-retirement.md)沿实际页面选择、可信权限及旧命令410分流，未发现已列 Server 入口的静默 Browser 回退；只读实际旧 bootstrap/quote/order/schedule API 均404。9个未运行旧测试容器有24条7bf3缺失挂载；七个同镜像源码的canonical运维文件另存新目录供后续核对，未覆盖/启动/清理旧资产。当前真实来源目标不依赖这些挂载；不是旧环境恢复成功，也不升级为已退役。

**新增P2待修**：独立复审发现归一退役正则与后继dispatch的大小写规则不一致，混合大小写可进入旧业务分支；尚未对真实库验证写入。将从精确main单独修复/合成验收，不改#132已验收head，其他挂载/HTTP观察结论范围保持。
