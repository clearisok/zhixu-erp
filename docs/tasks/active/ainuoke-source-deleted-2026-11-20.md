# 艾诺科订单删除生命周期（Issue159，实施候选）

用户2026-11-20明确实施授权：新增完整目录确认的「订单删除」异常、红色标签、停止删除合同自动任务、重新出现恢复及历史保全。本轮仅代码/测试/本地实机演示/独立PR；不合并、不部署Staging/Production、不修改真实状态。用户确认PI2611-142/SO-00000629、PI2611-143/SO-00000630业务取消后在艾诺科主动删除，样本只用于回归，不硬编码产品代码。

## Baseline与交付边界

从GitHub API核实最新main636a5ad0d2d1acbe6b2705696e782dea12ee9f00建立feat/ainuoke-source-deleted；起始clean，旧fix/catalog-mutable-recapture/32293c35运维文档完整保留。Windows fetch因127.0.0.1代理连接失败，NETWORK_DEGRADED；本地对象/最新main完整SHA已核实可继续。独立Issue https://github.com/clearisok/zhixu-erp/issues/159 ，Project既有字段不重建，用户明确实施范围转录v1，不另索要已给批准。工程与远端交付分别报告，不伪称push/PR通过。

## 实现

0060只前向新增目录来源状态/确认时间/版本和不可变生命周期事件，不迁移推断旧invisible为deleted。当前生命周期不等同织序draft/cancelled状态；订单数量/生产/成本/材料/出运/快照全部保留。事件按source+id+version及确认run唯一，状态变更须同事务已有对应不可变事件。

正常captureCatalogOnce在真实SDK协议、账号指纹、完整分页和双遍内容校验成功后，只有新鲜catalog-discovery且未复用断点页才能请求生命周期转换。publishCatalog原锁/身份/审计/事务内，校验以前完整双遍run确曾包含该合同、与新run账号/报表/空查询范围/pageSize一致；BillNo唯一关联local SO，id仅额外校验；新完整双遍均缺失才确认source_deleted。旧after-only/无完整历史证据不伪造为双遍。物料/单合同/局部查询/失败/历史发布/旧时间回退均不得作为新删除证据。对比只读旧hash及原采集时点，不重写旧页。

恢复必须新的完整catalog-discovery确认重新出现；追加source_restored事件，当前状态present/清当前deletedAt但旧事件保留。既有源id/BillNo冲突严格拒绝，不重复建单。自动入队仅visible且present；旧已排队删除合同在claim前failed/source_contract_deleted，不执行来源IO；手动新请求409并提示等待重新出现，unknown优先保留人工核对。原批次/租约/去重/30分钟和Price隔离不改。

订单列表/详情可信投影通过合同号+额外id及当前账号匹配读取生命周期；新增order_source_deleted标签红描边浅红背景红字，复用现有尺寸圆角，不改表格列宽。已删除来源不再冒充material_source_stale/unavailable；其他颜色/单位等独立异常保留，普通stale继续橙色、unit missing继续紫色。RBAC/session/商业数据读取边界不变。

## 真实Staging只读取证（2026-11-20 10:03:54北京）

两单仍draft，数量10000/8000，visible=false。历史成功出现11/19 11:00:01.754761，历史capture250613b7-278e-4445-be7e-bd1b8b363e62；旧内容hash215a2c2823e0b27869e3275b95774497978b9606fc3774607eb531e8408f083a。当前run97f46dd4-9cb0-4e19-98c1-32d886bfcced、capture3b3762ff-6208-4ea0-9ebc-4171f231590b，11/20 09:57:25.086644，13/13页、同账号，当前hash06767c012c44d38f07564b5bd295a8a2a8f9cf85a4d7cfe2987e4bb0e8178369。仅SELECT/BEGIN READ ONLY，无SourceIO/刷新/任务/配置/迁移或真实状态转换。用户的实际删除业务确认与系统本次只读可见性证据分别记录，不把尚未部署的source_deleted冒称已在Staging生效。

未来另获部署授权后：新受控备份/组件与0060兼容/正常迁移/健康；不SQL回填；由下一次正常新鲜完整双遍目录沿同一正式转换机制确认两单。旧成功run/hash和失败/暂停历史保持；Recovery Gate及Supervisor规则不绕过。本轮不执行该部署流程。

## 检查点一

真实隔离Docker/PostgreSQL生命周期与0059→0060升级10/10通过：删除/一次缺失/分页/认证/isOk=false/范围账号/仅物料/从未出现/其他正常单/队列与unknown/旧数据/重复事件/恢复。首轮6/8暴露订单列表readModelSelect漏接生命周期（事件正确但UI投影空），定位并补接；第二轮8/8，新增升级与独立异常后10/10。旧表原列逐行hash不变，迁移不创建删除事件；新完整目录才转换。TypeScript已发现测试请求联合类型未收窄，修正测试类型，不放宽运行时校验。完整回归/build/browser在后续Gate记录，不把定向通过当最终验收。

本地演示使用实际SDK合成transport+真实隔离PG+正式API/构建UI，样本合同与SO编号明确为合成回归标签。没有真实艾诺科请求或Staging数据写入；合成时钟制造正常单stale与另一单fresh/unit missing，不编辑真实时间/业务记录。


## 检查点二：真实浏览器与回归

目录/Price/同步回归106/106，旧订单异常API回归1/1，Source20通过/1 Linux-only跳过。前后端build通过；typecheck通过，lint首轮仅演示夹具未用参数警告已明确void处理（不改产品逻辑）。本地Chromium实际构建UI验证通过1/1：1366×768、1440×900、1920×1080、2560×1440；管理员/只读角色、刷新/直接API详情、同尺寸24px/12px字/4px圆角、异常列宽不变和无页面横向溢出。两样本使用用户指定合同和SO标签，客户/品牌/业务事实明确为合成，正常第三单橙stale、第四单紫unit missing。未访问实际艾诺科或写Staging。

浏览器夹具首轮曾尝试一次绑定4单，被既有精确2单scope正确拒绝；改为正式两单首次绑定、额外两单正常目录接纳，不放宽边界。合成6087050按InsideOrderNo返回的合同映射漏项被row_scope保护正确拒绝，已修复夹具映射。旧浏览器清理EBUSY曾遮蔽主断言，测试现在等待Chrome退出/有界清理并先保存主错误；DOM含隐藏移动渲染，断言改为真实可见标签计数，不放宽状态/颜色/宽度断言。最终真实浏览器通过，截图保留本机artifact，非真实Staging效果。

完整root首轮在文档前向冻结尚未登记时失败（worktree/state drift），已在cb9433d9为三个实际修改文档追加Git blob证据并对齐main636a。无改旧ID/图片hash或弱化断言。首次无网络Linux根测试因依赖挂载不叫node_modules造成Node sibling解析失败，已定位并修复隔离环境挂载；这次失败不算产品通过。新一轮完整root/基线及最终显式guard尚待日志收口，不提前PASS。

此前Windows Git代理失败不重推；宁波SSH一度超时，随后Tailscale DERP真实恢复连通，读取到host Node22.22.1/Git2.53.0及原准确636a源码。按用户既有授权仅使用独立Git交付目录/正式git-delivery工具，不改Staging服务、DB、网络或认证。最终远端精确SHA和PR仍待核实。


## 检查点三：非空历史保全与演示版本身份

首个生命周期回归增加正式service创建的非零报价劳动成本12.5和绑定该删除订单的生产排单/累计产量10.125；删除前后对全部非目录/同步控制业务表逐表逐行hash比较，不仅断言订单还在。升级仍验证原所有表旧列不变。新非空历史场景已单独通过；首次在并行重负载下合成Python子进程10秒超时，保留失败并原样重跑通过，没有放宽实际源站180秒/认证/业务范围保护。TypeScript保存计划回执按assert.equal实际applied收窄。

演示构建显式Server/snapshot/session且DEV标识，build源码fbd9ec31486c4e77137685537b908911d8aa6e49；不是Staging636a。用此构建重新运行Chromium四分辨率/两角色/刷新/固定列宽通过；之前复用本机构建残留的旧标识截图不作为最终候选身份。demo脚本拒绝错误authority构建，并在两小时后释放自己的临时DB/HTTP，不读取任何真实配置或Source凭据。

无网络Linux根测试已1025/1026，唯一失败确认来自Win esbuild被带入Linux的原生二进制平台不匹配。使用预存Linux镜像同版本0.25.12二进制的进程级ESBUILD_BINARY_PATH，Q5定向3/3通过；没有改锁文件、安装共享依赖、跳过或弱化Q5。完整根/基线须在该正确隔离环境最终收口，不以1025/1026算PASS。

最终代码2fb03344：完整npm test在正确无网络Linux环境1026/1026（Node22.23.3、锁文件hash41ee8f28…同当前、esbuild Linux/Win同版0.25.12）；本机typecheck/lint通过；含非空历史的生命周期/升级10/10。新生命周期与四分辨率浏览器回归接入原Source CI两个现有步骤，不改权限/触发/超时，不增加部署自动化。发布基线单独命令遇到Docker共享日志I/O错误，改在自有容器内部文件保留日志后复验；不把异常退出算通过。
