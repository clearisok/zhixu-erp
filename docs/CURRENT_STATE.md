# 当前状态：项目复审与明显缺陷修复，本地验收完成

2026-11-04；分支 `feat/ainuoke-full-catalog-followup`。本轮输入干净提交 `00baeb6c38a879106666c8cef65cb6662f37769c`，继续保护此前已验收改动。main 本轮只读核实仍为 `cb5cc29baa49ed7115fdb6c9506b6a80356936ea`；[PR140](https://github.com/clearisok/zhixu-erp/pull/140) 草稿仍为远端 `32100b27d3b14dcbfef5ce6a83ace6c3d4ce5836`，本地修复未上传。完整结论见[项目审计](tasks/active/project-audit-2026-11-04.md)。

- **本轮修复**：证书/权限/分页/载荷及未知采集错误持久暂停，后续 tick/队列不能自动继续；目录接纳/回执 UUID 完整校验并返回400；登录拒绝不再误写成密码错误。校准报价、生产、关账文档的当前/历史入口。没有新增业务规则、SQL、UI、依赖或采集范围。
- **本轮验证**：目录/同步49项通过；共享来源21项中20通过、1 Linux 专属检查跳过；Python离线42项通过；类型、Server编译、8路径lint通过。最终提交另做精确源码守卫；182项发布守卫回归复用未变脚本的既有成功结果，不冒称重跑。未重新执行完整浏览器/全量模块或触发付费CI。
- **远端**：PR140首次Release baseline/First team access成功，Ainuoke source失败且后续步骤跳过；兼容修复在00ba，本轮修复继续叠加。没有新的push、CI、合并或部署。上次送达但Git退出1触发STOP_AUTH_OR_DIVERGENCE，根因未解释，现有元数据例外不扩大为新Git写入。
- **真实数据与staging**：复用同日已保存只读证据，当前账号可见608目录；隔离覆盖550成功/5失败/53排队，550不是正式SO。staging仍f21c96c1899126028ba9a272727ad8d564ccf185、3 SO/2报价/121公有表；新目录、分档及有限恢复未上线。未重新查询或修改真实库，不清库重建。
- **剩余边界**：固定登录恢复在1登录/0报表、isOk=false后已关闭，网页登录成功不能解释采集器拒绝；本轮0真实来源请求。608详情首轮和持续稳定性未完成；当前自动链不包含独立成衣出货/货款流程。升级137表需要重新绑定备份并验证配对/异机恢复，原覆盖库/卷/550成功证据全部保留。

下一阶段先收敛一个候选交付，再以新固定范围解释登录并补齐58张，证明247张高频持续运行，完成新备份恢复后申请长期试用站升级与代表性业务验收。[输入状态](tasks/completed/2026-11-04-before-project-audit/CURRENT_STATE.md)、[既有CI及staging证据](tasks/active/pr140-ci-and-staging-status-2026-11-04.md)、[固定登录停止](tasks/active/ainuoke-login-recovery-2026-11-04.md)保留。
