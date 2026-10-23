# Gate7F 成衣观察受控操作者入口

2026-10-23，Asia/Shanghai。root唯一writer，既有审查者只读；完整G1–G5目标继续。

## 基线与边界

- main d1dd4f0fcf9992d5c055c7b67b6832b635485680，11:23:47.807Z独立API重读相符。五个草稿PR121–125未变。新分支codex/server-garment-operator从该main建立，再FF完整8f2b32703af7ba7a7afe6fd89a2b5454fd1518a1；开始树干净，无继承dirty。
- 前一Gate真实组合两份PR并保留父历史，21单元/9PG/8built/134发布通过。最终8f2工具一次push仍STOP_AUTH_OR_DIVERGENCE，但独立API核实完整SHA/tree/父精确；不改写协议STOP、不重推、不据此证明长期网络恢复。原记录保留在outputs/final-pr-combination-20261023。
- #123/#125新CI被Billing/支出上限拒绝启动、0steps，用户确认尚未处理，继续安全本地交付；不重派同样CI、不改账单。原运行态refs ebe4/4cf1及3001/50426/59069/62426等保持。
- 本阶段无真实Source/凭据/私密报告读取，无目标启用、schema/HTTP/权限目录/调度变化、现有账号或DB操作、部署/切换/退役、merge/close。

## 范围

复用D158内部控制层和原私密文件/报告机制，增加显式plan/collect-once/receipt源码CLI。严格单SO job、原过滤证明与期限、原UUID回执；receipt不依赖证明、凭据或当前target。新采集先完整当前范围再打开秘密，且原控制层再次校验。未知提交或报告失败不显示发布成功，也不自动重采。没有第二套collector/target/SQL/回执。

独立预审已核实该切片符合原已批准收敛，不需要新增业务规则；目标真实启用和Source额度不由工程入口默认获得。具体格式及边界见[操作者文档](../../features/AINUOKE_GARMENT_OPERATOR.md)，旧Gate7E冻结文档保持原字节。

## 当前验证事实

实现后首轮4项纯/私密文件检查通过，18320.0308ms，0skip；scoped lint通过。首次Server编译发现四个TypeScript窄化错误，已在读取正则match和可空proof前显式return fail修正；再次Server编译退出0。

首轮PG9项3pass/6fail（含父项失败，148224.27ms），原日志保留。缺失actor的原BootstrapGuardError没有code，CLI增加静态安全映射；Windows ACL耗时使全套共用的固定夹具时钟落后DB started_at，原expires>started保护正确拒绝，没有放宽SQL。夹具改为每单实际起点、九分钟原允许范围，过期回执测试后下一单重置起点。第二轮13/13通过220194.8743ms、0skip，含dirty源码入口正确拒绝，不算clean入口正控。原33控制层回归通过20721.6352ms、0skip，COMMIT/回滚/撤权/引用保持。

独立静态复审发现P2产物衔接：最初CLI仅接内部三字段，现有核验工具却输出完整private wrapper。已改为严格原producer包装adapter，原checkedAt重建并完整比对；合成fixture直接消费原producer产物，拒绝伪label/manifest/bare triple。修复后5项纯测17143.4729ms通过、Server编译通过；补真实现存合成actor撤sync/缺凭据负控。该修复后的完整PG/clean源码入口与复审尚待，不借第二轮结果。

后续先完成定向/原控制层回归与独立复审，保存独立源码checkpoint，再以精确Git archive/native长路径验证类型/构建、干净源码入口。追加不可变证据和本维度能力，再运行explicit d1dd守卫及发布134。Git交付继续尊重既有STOP，Hosted CI账单限制未解除；不创建重复累计业务PR，不将本地结果冒称送达或CI通过。

ee6f570f5c689569b088cc5af28a64c7795821f3干净源码完整定向15/15通过251843.0245ms、0skip，原producer包装及撤权负控均通过，实际源码子进程receipt正控退出0/历史published/零Source。精确native archive类型检查发现纯测试86行union字段未先narrow，未继续Server/lint/UI构建；已只增assert.ok显式窄化，不改产品。原失败context/archive/日志保留，新精确checkpoint后重验类型、纯测与构建；15项结果仍属于ee6f，不改名为下一SHA。

最终461841c0542f05f01e2677877df59af3b45d5bc3的纯5/5通过18275.1847ms；精确Git archive/native长路径全量types、Server编译、完整lint及显式Server UI构建全部退出0，46路由/0skip、单Context、build-info精确4618。共享私密/恢复40/40通过252610.6654ms，其运行跨ee6f→4618测试/文档commit但相关执行blob不变；不冒称稳定HEAD全套。独立reviewer复核源码和日志无剩余P1/P2，未自行运行测试。

[工程报告](../completed/2026-10-23-garment-operator-engineering.md)已冻结a786f5f796ae64e63a174ac332dc42f8ffc2c763。11:56:54.814Z独立main仍d1dd。原318证据全保留，追加D159/新feature/报告为321/59；仅现有成衣控制能力的implemented/isolatedTest评估前向更新，状态值、其他58能力及其他维度、UI/批准/运行态不变。explicit d1dd守卫PASS（11页/59能力/87继承UI、errors=[]）；发布134和最终证据复审尚待，不能以此宣称CI或部署通过。
