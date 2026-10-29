# 0051当前镜像、非空恢复与实际浏览器工程证明

2026-10-28，feat/order-closing-month-plan。阶段输入cf77e1a6d7626808c3ba958137aeb52e5978976b；测试harness源码de5b1c4cd3b60288624e2823def5e9ce3ee8e331。沿用已核实本地main869ee84dd0b31de6161011e4aa560678b244a64d；未刷新远端，不称最新main。业务代码仍为已验收fde8，产品/SQL未改。

## 精确身份和结果

| 验证 | 实际结果与范围 |
|---|---|
| 镜像 | cf77规范archive3221 blobs/0 overlays，一次build75481ms；50迁移文件、最高0051；显式Server/session/snapshot、完整source labels和BuildInfo一致 |
| 测试harness | de5规范archive3223 blobs/0 overlays，tar SHA256 76070679254cb0249b0f8333be6938e7c66a684fc50df274e791299043c56fa3；仅docs和5个集成测试文件不同于cf77，全部产品/SQL逐路径相同 |
| 定向控制 | 28/28，277ms；缺失/停用trigger等原真实红10中2fail保留；实际owned PostgreSQL catalog1/1，6861ms；语法及定向lint通过 |
| 完整恢复 | 一次9/9，421653ms，0失败/取消/跳过；新schema/admin、TLS对象存储与负控、重启/冷重建、非空备份、两新owned项目恢复、GET/回执核对 |
| 新镜像浏览器 | 一次实际Chromium9/9，18812ms；从唯一image复制静态包到de5 runner，生产等价host API＋owned PG，fresh profile。不是直接浏览恢复后的Docker服务，也没有操作旧用户页 |
| 旧资产保护 | 恢复后及浏览器后，原68容器/191卷/33网络/278旧本地refs无选定字段变化；仅任务分支cf77→de5为正常checkpoint。三个原demo的BuildInfo/source/build前后保持 |

镜像tag zhixu-closing-frozen:cf77e1a6-20261028-37a075518b；ID sha256:ec2987de1be1dd31435a766081bafcbd11b98fe9efbc24333b236c5811ac74a6。

恢复入口显式验证desktop-linux、本机npipe:////./pipe/dockerDesktopLinuxEngine、linux docker-desktop和唯一imageId，拒绝ambient Docker target；仅子进程固定DOCKER_HOST，未改共享配置。构建前未留下fresh target回执，不能追溯声称已做；之后在明确本机daemon找到精确产物并在恢复前重新核实。

## 恢复完整性

- 维护停写后的源库与恢复app启动/登录前，121张public表逐行hash、sequence和0051 catalog指纹完全相等。非技术业务表113张，其中81非空；该113是121中的分类，不能相加。
- 财务13张要求表均非空；18个只读回查和18份原命令回执恢复保持。期间2/版本9、allocation4/版本4、关账commands9、USD采用commands1、月份plans3/versions11/commands8/financialLinks4。
- 原Source fake worker恰好2次、generations[1,2]，回执5；没有真实艾诺科IO。恢复工程也覆盖Quote/CCT、加工batch/SO、生产/完成、物流、物料独立ledger，详细各表hash仅在本机受保护原件。
- 精确0051保护：public.server_closing_month_plan_versions；trigger month_frozen_lines_validation，enabled O、tgtype7；function public.validate_closing_frozen_month_lines，原plpgsql/trigger/0参数，无WHEN/trigger参数/security-definer/proconfig，body与0051源码相等。
- body SHA256 f2df4338587d4dd7a8719a03e588bb0b8e8072cd4efadb7a8692a39fa3985ef5；trigger定义9e05113af1908469d26b74587bab1dac580f34f80c05244943fb2ba65e6a3b82；function定义fe87e3039cd76f759552999d4e9b64a47c662b100d000ecd541088ae9e441df2。源/恢复前及财务snapshot指纹一致，不只相信migration ledger。
- 只使用zhixu-quote-trial-it-3159db2c4e与zhixu-quote-trial-recovery-3159db2c4e；4个新/28先避开宿主及已有Docker路由。仅成功owned项目/合成备份按既有协议收尾，失败资产未盲目清理。

## 独立复审和原失败

既有只读审查者发现的catalog恢复与本机target两项验收P2现已关闭；后续精确de5跨领域静态复审无新增、证据充分的P1/P2。范围为可信合同/加工创建与Quote/CCT商业版本、生产固定归属与关账更正、物料/成衣观察独立性及Server authority/旧写入口退役。抽查Source刷新保持商业/执行历史、完成更正0仍保护归属、取消保留原产出、跨物理SO/过期context、物料跨单位/owner/generation等现有负控断言；复审者没有重新跑它们。结论不覆盖全量UI、全部组合/并发、真实数据、环境或人工验收。

原PG catalog第一次运行因测试client清理顺序卡住，152858ms后仅终止已识别该Node child，记中断非PASS；try/finally先release后新owned PG测试通过。第一次有界local Docker info失败原因仍UNRESOLVED，原件保留；随后显式本机pipeinfo及唯一imageId核实成功。runtime/browser回执里的review字段记录执行当时状态，后续有界静态终审结论以本节为准，原回执不覆盖。

## 体验、证据和边界

现有实机http://localhost:62411/closing-center?year=2027，source fde8、build closing-chain-fde8b0f1-20261028、合成closing.editor；产品/SQL与cf77镜像一致。是owned临时PG体验，不是持久正式目标；未替换当前页或输入。旧61104/source4107和预备53001/sourcefde8保留。既有实际10件2月→11月保存证据见[D176工程](2026-10-28-closing-chain-correctness-engineering.md)，不是本片又执行一次业务操作。

本机原件outputs/closing-frozen-image-recovery-20261028：runtime log SHA256 e177af0a916c8ebf8b065403f8f966754997c5f390dddc9fa1f4aa1958c18e47；browser log SHA256 02158008d2eb56637649e0d1061ce6d3259403e58d497071c4effe1a7b2997c7；baseline/prepared/image/harness/controls、原中断/local-target、两次preservation及demo前后身份一并保留。

本证明checkpoint之后只前向冻结阶段及本证明，保留565旧记录，执行同main精确守卫；此证明不预写最后guard PASS。未重复未改工具168项或前片243项，原source结果仍单独引用。本片没有TypeScript/产品/SQL变更，不再重跑同产品完整type/build。

LOCAL ENGINEERING范围通过；REMOTE DELIVERY仍pending，PR130前次精确head61704afe22fe9fd0ea9f6625c6092fcbb9575dfc、本片未送达；原Git/ref STOP_AUTH_OR_DIVERGENCE根因未解。真实Source0、Hosted0、远端写0；无真实账号/业务库、merge、正式部署、切换或资产退役。具体配套UI与归属恢复规则仍待已有问题答复；这不是整体Goal完成或用户业务接受。
