# Issue165 最终交付与集中验收

2026-11-24 03:02Z（北京时间11:02）；本报告使用已批准的38项原方案，不重新审查/重写方案。**全38项组合版本已部署Staging，正式新source完整备份、清理、九项恢复门禁和唯一Worker新心跳通过。当前电脑HTTPS入口/版本/健康接口可访问；实站浏览器复验受Codex桌面连接错误阻塞，不能宣称已完成。** 用户集中业务验收待进行。Refs #165。

## 固定部署版本
- 组合PR172，codex/ui165-staging-acceptance，a0a9c78c6cccbadf5e635dbb60169f7f87944644；main基线10b9a7d827e1c09f152ead58c21f26712d49a619。
- app image sha256:a0339f6b74e88a4df7a270d9f4573014e024f2abbf0c07eb082d3e399c32ce9c；build staging-material-a0a9c78c。
- Worker image sha256:d6ddbaf687b72ba22a8a0f4de06f76c26818e40166db3efecca799caf1af0937；独立备份工具源码2ce1154e8d64370f513f566f9e15235f56dc7509、executor SHA256856c5f3c1cfc60b3bd0f3ff7bdd993a5ca71cb693c1159238b748d0c683d062b（PR173）。
- 五批产品27独占blob精确一致、11共享保留双方变更，无新增产品范围；原审查报告blob不改，manifest冻结字段不改。Source/SQL/migrations/ops除独立备份修复外不变；不合并main/正式PR、不Production、不改业务规则/数据/权限。

## 38项与实际入口
入口前缀https://staging.weaveops.top。详情通过现有列表打开，保留页面的真实id/orderId参数；不为了触发验收场景创建、删除或修改真实业务记录。涉及受限角色、缺失/错误/危险确认或无现成业务数据的状态，隔离合成PG真实浏览器证据与Staging只读覆盖分开记录。

|编号|已实施内容|验收页面/入口|实施PR|
|---|---|---|---|
|G01|删除dirty检测教学正文，保留丢失输入后果|/system-settings/quote-settings；/system-settings/roles；基础资料编辑窗|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|G02|删除侧栏报价UI V1|/quote-center（共享侧栏）|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|G03|身份显示保留姓名账号，删除identity后缀|/quote-center（共享顶栏）|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|G04|无权限按钮关联原因并支持键盘、触屏及Escape|/quote-center等共享操作；受限角色见隔离验收|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|G05|搜索选择器具名并关联真实listbox|/quote-center/detail；/basic-settings/brands；/basic-settings/customer-salespeople|B / [168](https://github.com/clearisok/zhixu-erp/pull/168)|
|G06|FormItem稳定label/help/error关联接口及调用接入|/quote-center（列宽设置）；/closing-center/detail|B / [168](https://github.com/clearisok/zhixu-erp/pull/168)|
|G07|五模块八处复选框复用Foundation|/quote-center；/quote-center/detail；/system-settings/roles；/order-center/server-detail|B / [168](https://github.com/clearisok/zhixu-erp/pull/168)|
|G08|正式路径十处确认统一，放弃与原请求重发分离|/basic-settings/brands；/basic-settings/customer-salespeople；/basic-settings/fabrics；/basic-settings/trims；/system-settings/quote-settings；/system-settings/roles；/closing-center/detail|B / [168](https://github.com/clearisok/zhixu-erp/pull/168)|
|Q01|删除报价基础/成本/辅料重复快照教学|/quote-center/detail|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q02|版本选择按钮明确复制后更新/直接更新|/quote-center/detail（更新版本）|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|Q03|三个底层file input真正隐藏，由具名按钮激活|/quote-center/detail（附件）|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|Q04|删除聚焦粘贴区重复入口，保留区域和快捷键|/quote-center/detail（附件）|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q05|删除款式图确认保留准确后果，删除技术字段说明|/quote-center/detail（款式图确认）|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q06|移除mock阶段危险提示，保留不可撤销/已有确认警告|/quote-center/detail（价格方案删除确认）|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|Q07|内部汇总使用价格方案/估算成本业务名称|/quote-center（内部汇总）|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q08|删除导出Server/Browser对照，保留模板/范围/未保存警告|/quote-center（导出）|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q09|删除正式报价操作记录重复副标题|/quote-center/detail（操作记录）|C1 / [169](https://github.com/clearisok/zhixu-erp/pull/169)|
|Q10|卡片键盘仅响应自身，内部编辑Enter/Space可用|/quote-center/detail（价格方案编辑）|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|B01|正式五页面隐藏工程来源横幅与重复退出，保留候选诊断|/basic-settings/brands；/basic-settings/customer-salespeople；/basic-settings/fabrics；/basic-settings/trims；/system-settings/quote-settings|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|B02|精简面辅料页头/抽屉教学，供应商字段保留|/basic-settings/fabrics、/basic-settings/trims|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|B03|生产组/外发厂UUID移入已有编辑抽屉技术详情|/basic-settings/production-groups、/basic-settings/outsource-factories|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|O01|订单列表/详情权限失败合并单一明确ErrorState|/order-center、/order-center/server-detail|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|O02|目录未读/已读空/搜索或范围无匹配分别提示|/order-center（全部合同）|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|O03|物料读取脱敏分类，GET重读与来源采集分离|/order-center/style-progress/detail|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|O04|取消加工批次确认使用danger，后果保留|/order-center/server-detail（加工批次）|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|M01|明确关联采购单位；无采购时真实需求单位显式标明|/order-center/style-progress/detail|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|M02|对账页签改货款申请，非实付/不可重复合计限制保留|/order-center/style-progress/detail（货款申请）|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|M03|移除单一假页签，只保留已加载字段区一个标题|/system-settings/progress-settings|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|M04|返回名称按已有订单上下文确定，地址不变|/system-settings/progress-settings（有/无订单上下文）|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|M05|来源时间显式Asia/Shanghai，原始dateTime按需可见|/order-center/style-progress/detail|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|P01|排单数量/日产/队列表明确件与工作日单位|/production-scheduling（排单/队列）|A / [167](https://github.com/clearisok/zhixu-erp/pull/167)|
|P02|桌面/窄屏只显示一个零生产组空态，设置入口按原权限|/production-scheduling|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|C01|字段名明确汇总及明细范围，删除重复不变性说明|/closing-center、/closing-center/detail|C3 / [171](https://github.com/clearisok/zhixu-erp/pull/171)|
|U01|删除用户管理泛化副标题|/system-settings/users；/basic-settings/user-permissions别名|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|U02|删除普通角色教学，保护/权限定义/影响预览保留|/system-settings/roles|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|U03|删除角色确认danger，保存仍primary|/system-settings/roles（删除确认）|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|L01|删除同步记录泛化副标题，筛选明确北京时间|/system-settings/ainuoke-sync-records|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|
|L02|删除正式日志泛化副标题，时间/差异/技术详情保留|/system-settings/operation-logs|C2 / [170](https://github.com/clearisok/zhixu-erp/pull/170)|

## 六原PR精确提交与CI
|PR|范围|最终SHA|必要CI|
|---|---|---|---|
|166|规范与原报告|a588f41272d82d7150ecbe4ec685a775693f4eb0|三项SUCCESS|
|167|A7项|19e090bd13efa0fe552587acd3dc5eee2426bd3f|三项SUCCESS|
|168|B4项|83ed26fd65e7aa9f8d05a1260eb0d26c15cb1967|三项SUCCESS|
|169|C1六项|8ab2ef04736a867f21594cfb105c894144bb630e|三项SUCCESS|
|170|C2十一项|07fc0dc74a0524c9109a777674d665449340ee7c|三项SUCCESS|
|171|C3十项|2775aae86584f7a3db634dad658aa3ae46e767c9|三项SUCCESS|

三项为Release baseline、First team access、Ainuoke server source。组合a0三项SUCCESS（Source45309949015、Release45309949028、Team45309949038），备份工具代码2ce三项SUCCESS（Source45309921661、Release45309921638、Team45309921659）。后续运维纯证据提交与已部署工具代码版本分开，不用旧失败或其他提交代替本提交结果。

## 工程验证
组合产品7bf（与a0产品blob完全相同）typecheck/lint/Server frontend build、root1028/1028、显式release182/182、精确guard38路径PASS；a0精确guardPASS。八套实际built Server+owned合成PG/Chrome分别通过：关账18、compact13、货款申请9、排单37、导航25、团队8、资源23、物料11，共144项含父套件。资源首次查找/点击间重绘失败，只修测试原子操作，原业务断言不减；不存在的settings测试文件未执行、不计覆盖。新备份工具Windows10通过/1POSIX跳过、Linux32、精确GitLinux11、同Staging PG镜像实际默认/zstd全恢复3表1111合成行及截断拒绝通过。

## 恢复与数据保全
完整细节见[专项记录](ui165-staging-backup-recovery-2026-11-24.md)。旧22日snapshot450超时和24日17774e94归档600超时回执原字节保留；严格可选zstd压缩与全数据解码增强，不降低600秒/全表hash/前后快照/对象/清理要求。旧0752正式新备份70c0a21e验证145表13对象，58文件/manifest独立核实，九Gate和正常分钟新心跳通过。02:35Z受控切版只改三个无状态容器；DB/objects身份及四卷、schema/权限、23保护表、3用户及本次基线635订单身份hash不变，无migration/init/DB恢复。

新source a0的正式配对`20261124T023509Z-089bb129`于02:58:50Z完成BACKUP_VERIFIED：145表/13对象，第一遍全快照506805ms，归档374096ms，原TOC与完整数据解码通过，前后全快照相等；02:58:51Z四项cleanup全true、原服务恢复。03:02Z独立复核58文件大小/完整SHA及manifest `0a2f9c372571ef3e81a1df681fa7b28d5752fb491a1ce4ac193f6466361bb796`；原policy所有pin吻合、九项Gate全true、五容器健康、唯一新Worker正确镜像、新PG心跳03:01:43.148Z，Supervisor RUNNING/heartbeat_verified。历史code仍保留new_release_backup_required，不以改code清保护；当前状态、恢复结果及新证据共同证明正常恢复。

## 实际访问验证与覆盖边界

- 2026-11-24 03:01Z当前电脑通过既有`staging-lan`入口，TLS正常校验，`https://staging.weaveops.top/build-info.json` HTTP200/no-store，完整gitCommit=a0、构建staging-material-a0a9c78c，与源站返回逐项相等；session/server/server/writable/snapshot模式不变。`/api/v1/health`返回status=ok/database=ready。未更改DNS、hosts、代理、安全、认证或Cloudflare配置。
- 同时，Staging服务器自身经Cloudflare公网路径的相同探测返回403（Cloudflare/LHR），与当前电脑的既有内网入口不同。**不把内网200冒称所有公网位置可达**；柬埔寨或其他公网网络可用性本次未验证，访问路径问题保留。
- 本轮实站浏览器业务页面成功读取数为**0**。尝试新建Chrome页、读取已有Staging页均被工具拒绝：`Browser attachment requires a network policy. Update the Codex desktop app to the latest version and retry.` 未绕过工具或安全策略。已有用户标签标题仍为维护期间的502，不把旧标签当当前服务器结果；现有标签未被改写，建议用户刷新后集中验收。
- 因此本报告38项入口是已部署版本的真实路由与验收指引，**不是本轮25入口/21视图已实站逐页通过的声明**。25条白名单导航和八套144项是前述隔离合成PG/真实Chromium工程验证；实站登录、各角色、真实详情、条件错误/危险确认、触屏/键盘和截图复验仍待桌面连接恢复或用户验收。无真实业务记录创建/删除/保存、来源手动采集或权限变更。
- 未提供伪造截图；所有必要发布门禁本身均通过，桌面浏览器阻塞独立列明。源站/桌面入口运行证据保存在主机release目录`final-live-runtime.json`和本地交付artifact，原私密运行配置、凭据、业务数据及备份不入Git。

## 未实施的十项设计争议
D01登录动画/Slogan；D02物料概览与六页签；D03报价组合列宽/截断/默认密度；D04完整SHA与PROD标识；D05四类生产运输资源工作区；D06专用表格改DataTable；D07关账全年和12月卡片；D08全站字号/间距/圆角；D09普通附件删除统一确认；D10每项权限说明收起。均等待用户单独决定，不在本次部署中实施。

## 已知限制
扩展Quote套件三类失败（币种夹具PUT、默认列集合、1280旧严格列宽）已在未修改main同参数复现，未跳过/改业务/改冻结截图来消除失败，该套件不能宣称全PASS。完整快照当前约510秒，距离既有600秒上限余量有限；数据继续增长需要另行备份吞吐方案，不能靠删除历史或放宽保护解决。归档全部数据解码及隔离恢复均验证，但不冒称对这份12GB实际业务库执行了破坏性恢复；业务原库未被恢复覆盖。最终用户验收及Issue Done仍需用户决定。
