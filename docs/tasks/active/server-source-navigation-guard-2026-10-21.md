# Server 来源维护导航保护同步

## Baseline and narrow scope

2026-10-21，root唯一writer，沿用既有独立只读reviewer。
main独立API为 `996dfedc12da3527343cd3ff2aa5eea35497e10e`；从main建立
`codex/server-source-navigation-guard`，显式快进到干净、已一次上传及独立API exact的
`37f9fb78c425946376b0533b362568253fd23db1`。原工具STOP标签/remoteSha矛盾保留，
不重推。输入三份状态按Git blob逐字归档于 `../completed/2026-10-21-source-navigation-inputs/37f9fb78/`。

本切片只补已批准Server导航保护的同步点，不豁免来源维护或改业务流程；V1影响记录只列
`order-business-source-button.tsx`。继承加工Estimate三行保护及其28/87/927/116本地验收，
不把旧933d失败CI冒称本切片结果；不创建重复累计业务PR。

## Verified vs inferred

933d Source39472329558实际停在来源上下文首case，创建按钮目标文案20秒未出现；后六case通过。
Quote长套件及Python未执行；同SHA Team39472336074、Baseline39472342830 success，均attempt1。
原CI只留下超时，不含当时地址/导航提示，因此不能确定本次CI根因就是下面的同步窗口。

本机原套件自然8/8（19072.6607ms）未复现。随后只暂缓最后一个真实报价候选GET，
在fieldset首次启用的DOM提交，仅触发一次可见enabled按钮点击，实际仍留在订单详情且显示
“来源维护尚未完成”，创建POST=0；owned PG/profile cleanup完成。该观察套件9/9
（18467.813ms）只是证明已观测状态，不把旧产品被拦称为正确产品验收。

代码证据：子来源组件自己的全局guard用layout提交，但onGuardChange以passive effect镜像父状态；
父detail还有独立preparationGuard。按钮随busy=false已启用时，父guard仍可能true。
独立reviewer只读同意修同步点，不建议加等待、重复点击或导航permit。

## Fix and acceptance

仅将既有onGuardChange镜像及cleanup改为layout effect，使按钮可交互前父guard同步。
同组件也用于报价列表/详情的关联订单对话框，V1页范围包含两处并验证嵌套来源保护。
原dirty/pending/busy判断、session/epoch、保存/未知回执、服务端命令和报价创建身份保持。
不删除父/子保护、不自动重试点击/POST、不新增价格或业务数据模型。

正式回归暂缓真实GET，在1440与390两个宽度的首次启用提交中各点击一次；必须进入
携带精确sourceOrderId的原创建页，仍无创建POST或Quote计数变化。旧六尺寸、首次创建、
拒绝回执、双击幂等、未知提交恢复、A→B→A、旧401和无权/缺失上下文全部保留。
失败诊断只记录合成场景的路径、宽度、控件就绪和拦截提示，不输出凭据/headers。
独立复审补齐屏障释放前的DOM前置：真实GET到达屏障不等于load/setState已提交，
只读等待目标已渲染且disabled后才安装observer/释放；不延后首次enabled点击。
诊断读取失败也保留原始超时，不以新的navigation-context异常覆盖真正失败。
正式新回归在旧919643构建实际7pass/2fail（38088.2661ms，含父节点），
唯一leaf是首次启用单击后仍留原页/出现拦截而创建文案超时；其他原用例通过，诊断保留。
随后只改同步点；尚未声称修复后的构建、浏览器、质量或新CI通过。
冻结前类型、全仓lint通过；harness两处静态建议修正后精确eslint再次通过。
独立只读复审未发现产品/权限/未知提交保护阻断，三输入归档逐字相等；未代跑测试。

后续需冻结源码并显式Server构建，前端后Node串行，真实浏览器/导航负控、项目/基线、
精确main守卫及独立复审后交付。所有页面/数据库仅一次性合成fixture，不升级既有环境。

## Safety

不merge/close PR，不部署，不改真实账号/业务库，不新增艾诺科读取/绑定/激活/调度或退役。
3001/50426/59069/62426、旧卷/工作树/Browser保留，62426仍Gate1源8175。
无安装、共享Git/TLS/proxy/auth修改；持续Git工程授权不扩展业务选择。
6C两业务问题仍待人答，完成/物流/出货/Server关账未闭环；Goal保持active。
