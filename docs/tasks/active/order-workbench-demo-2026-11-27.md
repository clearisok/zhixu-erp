# 订单工作台 Demo：体验与复核

对应 [Issue177](https://github.com/clearisok/zhixu-erp/issues/177)。这是现有 ERP 正式订单页面的可运行改造，等待用户体验和 PR 评审；没有合并或部署。

## 直接体验

本机服务运行期间，打开：

[6233-937 订单工作台](http://127.0.0.1:5177/order-center/server-detail?id=02b75c2f-8dc1-414a-bfc5-3411bc636072)

本入口使用真实接口，只读查看。可以切换页签、点击颜色数量、展开生产/分月明细、查看物料及出货历史、打开原来源和交期维护弹窗。保存、采集、刷新来源等业务提交由本机入口返回403，不会传给远端。原保存能力保留在实际页面，使用独立合成测试库验证。不要用本入口验证真实业务写入。

建议依次查看：

1. 顶部款号、客户、来源数量和合同交期，以及独立的订单状态。
2. 总览中前移的交付计划；“维护交期”仍使用原编辑、预览、保存和结果核对流程。
3. 物料模块的历史入口与折叠的来源刷新；生产、成衣出货和关账分别显示自己的事实。
4. 点击颜色数量进入“颜色与尺码”，对应行高亮；手机表格在卡片内横向滚动。
5. “价格与历史”保留原价格明细和调价历史；底部展开来源与技术详情查看UUID及来源依据。

## 真实样例与限制

2026-11-27只读核对：6233-937 / SO-00000595 / PI2610-190，来源数量54,000，三色23,000、17,000、14,000。尺码XXS–XXL按原槽位展示，缺失值为“未知”，不合计补算。组件没有写死这些业务值；另一个真实订单SO-00000001也完成相同的42项浏览器检查。

出货接口在核对时返回503，页面保留“来源尚未接通”及原历史入口，没有虚构出货数量。完整的整单变更时间线尚无现成接口，页面明确说明，保留各模块原历史。关账展示分月安排和期间状态，金额及财务历史通过原关账中心查看，不视作收款或利润。

既有后台Worker独立运行，截图期间物料由旧来源更新为可读来源，颜色来源批次也有更新；每次展示均来自对应GET。本Demo没有触发采集或修改同步机制。截图中的既有PROD页脚是构建标记，不能作为部署证明。

## 本地重新启动

要求现有项目Node环境、已配置的SSH别名`weaveops`和对现有app容器的正常访问。容器名是本轮实际核对目标，环境变化后需重新核实，不能重启或切换服务器来迁就Demo。

```powershell
npm ci
$env:NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY='server'
$env:NEXT_PUBLIC_ZHIXU_IDENTITY_MODE='session'
$env:NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY='server'
$env:NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE='writable'
$env:NEXT_PUBLIC_ZHIXU_ORDER_READ='snapshot'
$env:ZHIXU_GIT_COMMIT=(git rev-parse HEAD)
$env:ZHIXU_BUILD_ID='order-workbench-local'
npm run build
npx tsx scripts/order-workbench-readonly-demo.ts --ssh weaveops --container zhixu-quote-trial-i174-v2b-app-1 --port 5177 --static dist/client --order-id 02b75c2f-8dc1-414a-bfc5-3411bc636072
```

已有5177服务时先在其终端Ctrl+C，或换一个本机端口；不更改服务器配置。工具只监听127.0.0.1，拒绝跨站访问及业务写入。凭据和session仅留在现有app容器的正常认证进程内存，不输出或保存；停止时正常退出登录。连接不可用时如实显示读取失败，不切换假数据。

可复核当前运行构建：`http://127.0.0.1:5177/__demo`。只读浏览器检查命令：

```powershell
node scripts/order-workbench-browser-proof.mjs 'http://127.0.0.1:5177/order-center/server-detail?id=02b75c2f-8dc1-414a-bfc5-3411bc636072' outputs/order-workbench/recheck
```

本轮没有配置或发布独立PR Preview。此Demo需要本机进程和现有API保持可达，不是长期托管地址。真实API浏览器验证不代替用户业务验收。
