# Gate7来源线索：6086979固定首页诊断准备

2026-10-21，root唯一实现owner、既有reviewer只读。用户回答原出货时点问题，提供原报告URL和明确载荷：reportId=6086979，insideorderno contains D1935，page1/pageSize100，flowName=[内层]。这是来源线索，不是数量/日期/颜色/稳定合同字段的返回证据，也不等于已选择手工发货时点。

## 基线及范围

main最近独立API核实996dfedc12da3527343cd3ff2aa5eea35497e10e、#120–127原draft头未变。新codex/garment-shipment-source-probe从该本地对象创建后显式FF到干净3b9a44a04b9fe7ae075098b7c76ff87564510b26，无继承dirty。该输入是Gate6D纯契约，19纯/36含原PG与HTTP、类型/Node/lint/独立复审及精确main守卫均通过，尚无物流SQL/API/UI、远端或新CI；不丢弃该工作。

已搜索本仓server/features/tools/docs/scripts/tests与本工作树ignored outputs的JSON/文本/日志，没有找到6086979已有响应。不能据此推断所有旧工作树或外部系统都无该报告。正常Report Catalog仍只有原五种键；不把诊断报表加入Bridge/持续Source。

本阶段复用已验证AinuokeClient、固定只读报表构造、无重试有界Transport和私有报告写入/ACL保护，准备专用诊断。固定原host/9043、一次登录+一次报表，最多100行/4MiB/120秒；不翻页、不调用Discovery/其他报表、不接织序DB、不绑定/激活/调度。已有HTTP D109决定不重问；新增真实报表读取次数仍须具体范围确认，准备工具和合成验证不消费真实请求。

insideorderno contains只查候选，可能包含多合同或前后缀相似记录；响应中稳定合同、单据/行身份、数量单位、日期业务含义与颜色字段必须另核。保留原始decimal/空值/重复行，不推算出货、收款或关账产值，不将物料出运当成衣出货。

实际读取前先完成固定scope、metadata字符串/数组、错误帧、UTF-8/ASCII通道、hash、时间戳、秘密反射、request计数和私有路径的合成测试及独立复审；脚本只输出静态安全回执，原文仅存本机受保护ignored目录。凭据仅由私密进程消费既有文件，不读取或展示其内容。

远端Git写入继续因664f真实非零退出而STOP，不重推/换认证；不借原CI标新工具通过，不合并/关闭/部署。所有旧入口/账号/业务库/卷/Browser保持。Gate8币种以外规则仍未确定。

## 本机工具与实际验收

新增Python garment_shipment_probe、Node garment-shipment-probe、私密PowerShell包装和对应测试。原writePrivateReport仅增加专用kind/前缀，沿用排他创建、nofollow、hash和ACL；Source workflow只加新Node测试命令，Python全量发现自动包含新文件。没有新增HTTP业务端点、schema、报表目录项或正式Source能力。

用户载荷由固定ReportDefinition重建，Transport逐个值校验，既有payment首页面动作本身不扩大。stdout只允许静态schema/状态/字段名/计数/hash/路径；密码/token/session按原严格检查，worker stderr与异常原文不反射。内部数值JSON不用于金额或数量计算，原始UTF-8文本与SHA256才是精度证据。

元信息缺失/空白保持未知。reviewer发现Node空白cellList与Python不一致，修复验证/拒绝证据两条路径并补正向回归。另以单项红测复现dataCount:null借用dataList.total，改为own-property判断，严格对齐Python；只在总数字段不存在时允许同响应的显式total。

实际合成结果（不混合不同时点）：

- 初版Python10/10、新Node10/10（9350.0146ms）；首次全Python141项/2.650s OK，记录于outputs/g7-candidate-python-all.log，不将该旧日志冒称142。
- 空白元信息修复后组合Node82/82（46444.019ms），0失败/取消/跳过，包含原payment/live-preflight、私密文件前缀和Windows包装兼容。
- 显式null总数单项红测0通过/1失败（Missing expected exception），修复后最终专用Node12/12（11609.6873ms），0失败/取消/跳过。
- 最终全Python142项/1.973s OK，独立日志outputs/g7-candidate-python-final.log；PowerShell AST 0错误。最终全量typecheck、Node编译、四路径eslint通过。
- Windows端到端实际启动包装和Node，仅使用自己的临时Git repo/合成受保护凭据；空密码在配置校验前拒绝、宽ACL在凭据读取前拒绝，0真实上游/0业务DB。

既有reviewer只读审查最终代码/相关日志，无新阻断；没有声称其执行测试。所有新测试属于工程验收，不证明6086979真实返回、业务语义、来源激活或新部署。

本轮发布基线实际116/116（357102.8747ms），0失败/取消/跳过。源码守卫基线main996dfedc12da3527343cd3ff2aa5eea35497e10e，工作树检查HEAD=3b9，PASS/11页/51能力/累计63 UI路径/errors空；本切片没有新增UI路径或修改原243证据/旧PNG。干净源码checkpoint后仍单独核对精确HEAD，不将working-tree守卫或既有Hosted CI冒充新提交CI。

## 下一步边界

新工具必须先成为干净checkpoint，再申请一次具体真实范围；不是要求用户提供密码或运行命令。拟定仅由私密进程消费既有D:/workspace/ainuoke-key.txt，固定6086979、insideorderno contains D1935首页100行，最多1登录+1报表/4MiB/120秒、无重试。此前读取次数不复用，D109 HTTP风险不重复确认。

取得真实响应后先离线核对元信息和全部返回列，再区分报告名、成衣/物料、合同身份、单据及行ID、颜色/尺码、数量/单位、日期对应业务时点、取消/冲销/重复行；未知保持未知，不自动发明出货或关账公式。超出首页不得自动翻页；业务含义仍不能证明时才列具体样本向用户确认。

3b9三摘要已另存至[输入归档](../completed/2026-10-21-garment-probe-inputs/3b9a44a0/)，复制时工作树字节SHA256相同，提交前核对Git blob与原3b9一致（仅仓库换行归一）。旧Gate6D、工具失败/CI和d6交付历史不覆盖。

## 一次真实执行终态

工具已保存干净e8f979bd9aa223fae0f330723ffc2f8301b8dcd7，精确HEAD/main996守卫PASS/11页/51能力/累计63 UI路径/errors空。随后用户明确批准固定首页一次读取，由私密进程执行成功，实际1登录+1报表/2HTTP，0行/total0、38列定义。该许可已用完，无重试/翻页/改条件或DB/绑定/激活。

已确认报告名“成衣出运登记明细表”，含本次出库数Num、出运日期outdate、销售合同号ExpContractNo等元信息；没有真实行，不能把元信息候选提升为实际映射或关账规则。onlyMyUser=true只是上游标志，不推断0行原因。完整脱敏字段表、时点、私密路径/hash和未验证项见[真实核验报告](../completed/2026-10-21-garment-shipment-first-page.md)。此前“未读取”各段按工具准备时点阅读，不覆盖旧证据。

## 用户提供D1933后的固定范围校准

用户回答下一样本范围为D1933。本轮main独立API再次核实仍996dfedc12da3527343cd3ff2aa5eea35497e10e；97cfa7800dfa143ac834b51673cb2bbb47aaa32c文档checkpoint及精确HEAD守卫PASS，工作树干净。中途只读分析了物流后台、创建了未改文件的codex/server-logistics-resource-store引用，没有遗留SQL/API/业务增量；收到样本后建立codex/garment-shipment-d1933-probe从该main对象显式FF到干净97cfa，无继承dirty。

只校准原5个诊断实现/测试文件的固定D1935为固定D1933，保持报表/分页/原host/预算/无重试及私密链不变，不接受调用方任意查询。旧D1935命令与上下文明确拒绝；旧e8f工具、97cfa真实零行结果/元信息/hash保留不覆盖。本切片先离线验证并形成干净工具checkpoint，新增一次实际请求仍待具体范围授权，未读取凭据或上游。前一D1935许可不复用。

本次校准实际Node12/12（10335.8354ms，0失败/取消/跳过）、全Python142项/2.392s OK、types/Node编译/两路径lint/PS AST0通过，既有reviewer只读复审无阻断。日志outputs/g7-d1933-*。本次没有共享private writer、workflow或UI/SQL变化，不重跑或借用旧82/116作为新输入的测试；前阶段实际基线116保持其原源码时点。独立checkpoint后核对精确main/HEAD源码守卫，0新Hosted CI/PR/远端写入/真实请求。

## D1933真实终态与用户业务决定

上述工具已干净提交2688a079227ec0f703287250d759e0923b58c1bf，精确main996/HEAD守卫PASS。用户随后另批D1933首页一次，实际1登录+1报表/2HTTP成功，16/16行、1合同/4单据/6颜色、全部件；本次许可已用完，0重试/翻页/DB/绑定/激活/调度。

主控离线核对raw/包装hash、与D1935相同的38列元信息和逐行类型/唯一性/Decimal统计；用户据样本明确确认Num/outdate出货口径，写D-152和BUSINESS_RULES。完整脱敏结果见[D1933报告](../completed/2026-10-21-garment-shipment-d1933.md)。原报告mappingVerified/businessMeaningVerified=false是采集时点的封存状态，不回写；随后用户确认独立前向记录，不将其扩张成已验证全量映射/Server闭环。
