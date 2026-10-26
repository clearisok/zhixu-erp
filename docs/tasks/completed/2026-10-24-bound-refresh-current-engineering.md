# 当前已绑定合同离线刷新工程证据

2026-10-24；source `df5bedaddd2f9e54f8c66f578e32f06859878104`，tree `86af079cc8206096f4b43ff86b373e87c81a9e9c`；main比较 `e01a11952b648024c0bd6bf4259de429374981e2`。本轮只用合成一次性PG、私密合成job/evidence和loopback，不读取真实来源/凭据、不修改任何现有账号/业务数据库或目标环境。

## 输入与职责

从clean aad673099da0221312a70e88bd8e2f33bfa06244接续、prep b9b4fdd保护原三摘要/hash及完整终态。a296→81a切片12非文档路径8相同输入/4手工，共19source路径含7份相关文档。原8代码中只有集成升级测试改用显式migrationFilesAfter(40)，旧行比较/空回执/幂等断言保留；其他7实现blob精确一致。live-preflight只增加bound-order-refresh类别，不顺带引入旧garment诊断。workflow/package/README只增本片命令/说明，不改触发/门槛。原0034–0040不动，无0042/43/UI引入。

复用正式Discovery/6087105映射及原DeliveryPlan来源writer，在caller事务内预览/应用已采集证据；没有网络/凭据loader/采集器/调度/迁移执行或公开HTTP写入口，不创建SO。DB连接目标指纹、profile/账号、可信合同/link、有效归属、完整物理SO、原owner镜像/颜色与DeliveryPlan集合进入精确预览。数量/款号/InsideOrderNo不能决定绑定身份。

apply重新fresh权限，effective fence→actor/roles→actor/request advisory→profile→完整物理SO组→原owner mirror/plan锁→CAS/来源更新/回执/审计。已经证明的来源link只UPDATE inside_order_no，不UPSERT或搬owner；alias与有效root的人工计划由既有0018保持。缺失/非法/空颜色拒绝替换，不清旧镜像；新/改名颜色不继承旧价，手工交期、商业版本与执行历史不重算。

actor/request唯一及精确payload（含DB目标/证据/预览）幂等；fresh权限后原回执优先于当前时效/CAS，不重复刷新。原UUID跨actor独立，变更内容冲突。0041只建空不可变成功回执表，原物理与有效SO引用进入现有归一盘点，不恢复公开归一操作。mirror/计划版本、回执和关联OperationLog同事务；公开结果不含原始bundle或价格。

离线plan/apply/receipt工具要求绝对受保护忽略job/evidence、精确SHA；apply额外请求UUID、预览hash、明确execute。执行入口检查clean精确源码与verify-only schema；receipt不重开已删除的来源证据。未知提交/报告缺失须核对原请求，不自动重采集/重发。COMMIT响应丢失不等于已回滚，本轮不冒称新模拟此场景。

## 当前实际检查

canonical archive SHA256 `041f69356b0ea2a8ecd2bc07d3c80807adf0ffc11eaaf23afdce7bcd78d1a231`，既有node_modules junction，无安装。大部分检查运行于不可变归档；仅受影响私密operator集成文件补跑于原始clean精确source工作树，前后HEAD/clean核实。全部账户/合同/镜像/计划/商业采用/生产执行与私密输入均为合成夹具，数据库为新建一次性目标。

| 检查 | 结果 | 进程耗时 |
| --- | --- | --- |
| typecheck | PASS | 38953ms |
| server-compile | PASS | 20815ms |
| compiled-app-load | PASS | 3141ms |
| lint | PASS | 56953ms |
| root-nonrelease | 811/811 | 27787ms |
| bound-refresh-and-regression-api | 184/185 | 191237ms（两次进程相加；联合覆盖） |

19文件API分阶段联合覆盖185项，184通过、1既有Linux CLI用例在Windows跳过（含父节点计数），不是一次185项全新绿跑。原归档执行185总/182通过/2失败/1跳过（163477ms）；失败是同一私密operator子项及其父节点：源码归档没有Git元数据，保护helper的git check-ignore返回128/not-a-repository。只读ACL校验实际通过、根工作树忽略规则实际通过，确认环境前置问题；没有削弱ACL或忽略规则，也没有给归档伪造Git身份。

同一clean df5bed提交原工作树只补跑受影响集成文件16/16（27760ms）；另外18文件169总/168通过/1跳过复用原真实运行，因此最终联合185总/184通过/1平台跳过。原始完整日志/JSON、环境诊断与补跑日志分别保留outputs/server-bound-refresh-current-20261024，core-results仍保留初次失败事实，不覆盖成一次PASS。该平台guard/cli.ts未改，不称PASS，不借其他通过填补；后续必要Linux CI仍保留。97文件根811全部通过。Node编译后实际导入app、bound-order-refresh和CLI模块，检查运行依赖，不启动真实index服务。

实际覆盖只读预览零回执/零审计、同request并发一次与历史重放、同UUID跨actor独立、独立请求竞争CAS、人工DeliveryPlan介入使旧预览失效、fresh刷新保留用户行；缺失/空/无效颜色、错误profile/未绑定目标/伪source DTO/非有限或倒退证据拒绝；审计失败原子回滚、撤权阻断新命令/原回执、等待role锁后看最新权限、连接目标变化拒绝旧预览。

合法来源数量/颜色变化后商业版本/颜色价格行/商业head、生产排单/计划版本、实际执行及执行版本逐表字节保持；原稳定颜色ID不依数量改变。历史来源owner刷新只更新原link的可变InsideOrderNo，其UUID/源身份/创建时间、alias与有效root的计划集合保持，读取沿现有归属解析。

私密operator实际plan/apply/receipt，提交后模拟报告落盘失败，再删除合成evidence文件，原request读回completed；这覆盖报告丢失及原回执恢复，不能称数据库COMMIT确认丢失模拟。0040前缀升级用已有用户/合同/颜色/DeliveryPlan/审计非空夹具，逐行保护所列旧表，0041回执为空、重复升级幂等；未预置0040出货快照，不能称非空出货观察恢复。另有当前39→41升级/garment reader/归一引用与Source调用链回归，但不扩大这些夹具的事实范围。

## 复用、发布和未授权边界

前端与整个Python包、锁文件未变；复制a0c3 Server产物215文件逐一hash相同，构建身份a0c3d164；本轮新Vite/浏览器/截图=0。d1930的139离线Python结果仅在未变包范围复用，不称本轮重跑139。未变生产/商业完整套件不重复，当前具体业务快照保护由上述新API实测。

source只读独立审查无新增P1/P2，审阅者未代跑测试或网络。proof/两feature/新能力前向登记保持旧390证据/57能力/runtime/21routes；发布134与最后精确main守卫按后置实际回执，不预写PASS或借#125CI。根811与随后134是分阶段联合945，不是一轮。

网络继承NETWORK_DEGRADED，本片push0/PR0/Actions0；不逐Gate重试失败Git。没有真实凭据/Source/账号/业务DB/现有卷、绑定/激活/调度、自动merge/close/deploy、50426切换或退役。保护3001/50426/59069/62426、Browser、备份和结果。Goal active，出货UI/0042交期/0043collector与关账三问后续，不默认业务规则或真实执行许可。
