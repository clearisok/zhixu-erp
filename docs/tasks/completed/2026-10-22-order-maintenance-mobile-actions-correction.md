# 订单维护操作：手机入口纠正与工程复验

2026-10-22；分支`feat/server-delivery-plan-maintenance-ui`。
本次精确产品源码：`2a19960a8f9810062f15b87e18214505aa74f8c5`。
main于08:55:11.783Z独立核实为`996dfedc12da3527343cd3ff2aa5eea35497e10e`。
本文件冻结本地纠正和实际截图；后续清单绑定、发布检查、远端与新CI另记，不提前声称通过。

## 原失败和实际缺陷

原验证提交6c8ecb6d52e3c1e86120bb42d538223d0c8c8473已精确交付。
Release39746532945、Team39746525939成功；Source39746518775失败，不能合称三CI通过。
原Source中的维护12项、P6十四项、披露九项通过，但报价上下文两子项在390宽度等待
“维护来源”超时，包含父项为6pass/3fail；后续报价生命周期及Python步骤skipped。
root随后使用原7584产品构建、本机原报价上下文测试复现相同结果，61912.8875ms，无skip。
这是产品回归，不是据此认定Hosted环境异常；旧断言、等待上限和失败记录均保留。

共用Foundation手机规则隐藏页头非最后直接操作。加入交期后，来源按钮仍在DOM却不可见。
局部分组先修复可见性；实际截图与独立复审随后又发现旧订单named grid规则优先级更高，
按钮仍挤在标题右侧。4e2的新同排断言确实失败（含父0pass/2fail，12826.8552ms）；
旧报价CSS的按钮width100%又使组内按钮各占一行。没有用早期绿灯或覆盖旧截图掩盖这些问题。

## 最小纠正

- 原详情中两个操作放在一个带中文可访问名称的局部组内，source/delivery原key、权限、
  readOnly、独立退出保护、owner、回执和Modal焦点行为均不改变。
- 桌面仍是标题右侧紧凑操作；手机只在本详情明确identity/actions两行named areas，
  两个按钮在标题下方同排。局部auto宽、不伸缩与外层flex覆盖既有冲突规则，保留44px。
- 不修改Foundation全局规则、断点、旧报价页面、Source按钮业务、报价创建writer、
  后端/API/SQL、价格/生产/订单身份或Browser数据。
- built测试先只读等按钮hydrated，再检查真实rect/display/visibility、命中、边界、
  同排和位于标题下方；逐个打开并关闭两弹窗，确认0PATCH与原事实不变，不靠重复点击。

## 本次实际验证

以下均属于上述2a199精确源码，不沿用早期候选结果：

| 验证 | 实际结果 |
|---|---|
| typecheck、完整lint | PASS |
| 显式Server前端build | PASS；server-delivery-actions-2a19960a-20261022 |
| buildTime | 2026-10-22T16:51:45.5111210+08:00 |
| 维护交期built | 13/13，28595.4665ms，0fail/cancel/skip |
| 原报价上下文built | 9/9，23826.8719ms，0fail/cancel/skip |
| 原P6 built | 14/14，58604.9834ms，0fail/cancel/skip |

构建为production、Server Quote/master settings、writable、session、snapshot。
页头覆盖1920、1536/DPR1.25、1440、1280、900、736、390、320八宽度，另加320细指针，
共九模式；原Modal八宽度、七合成角色、精确数量、单滚动、焦点、CAS/失回执/重发保护继续检查。
所有测试仅用自有随机端口、一次性PG与私有Chromium；真实Source请求为0。
root与独立reviewer实际查看最终320细指针、390手机、1440桌面三图，无剩余P1/P2。
reviewer未运行测试；该结论是工程复审，不是用户人工业务接受。

未在本切片重跑全项目927、API42或Python169；早期对应源码结果在
[原工程记录](2026-10-22-delivery-plan-maintenance-ui-engineering.md)和原CI保留。
新Hosted CI尚未执行，其结果须按精确提交另外核对。

## 新冻结资产

均为合成数据，路径`../assets/order-maintenance-mobile-actions-2026-10-22-2a19960a/`。
旧图片、hash、原失败、批准和历史状态不覆盖。

| 文件 | SHA256 |
|---|---|
| header-1440.png | c655ed6fcbde9c314285e9fdbbeb256bdb9e29e597fa6e84e1a3a0408144cf88 |
| header-390.png | 7f984810f068be717140660931f7b9e68ff6133f02e303e878765fa51e6c1842 |
| header-320.png | 7f6333cb8fd1d76a8d5ce10099edbd1f72d17a22fd8bbff8d35935be9ad61a52 |
| header-320-fine.png | d7b3bda98e90e7dd709517f6b75f2b1a28569398eda5451f94387c9a6e7a3c2e |
| receipt.json | effccbe6046620ad19ee625b97a2aa826687f9d401b4eac2238572cf5004fbbd |

## 状态和安全边界

实现和本次隔离工程通过；main996未包含本切片，未合并、未人工接受、Source未连接。
18443/18444、3001、50426和其他旧环境均未部署、切换或重新采集；历史镜像/运行事实仍以
原冻结记录为准。不修改真实账号、业务库、卷、Browser或其他工作树，不创建重复累计PR。
原批准仍为[同一维护交期批准](2026-10-22-delivery-plan-maintenance-ui-approval.md)，
本次只是保证已存在来源入口与新交期入口在其批准范围内同时可用。
原固定真实来源额度已消费，不因本次通过或旧ignored记录缺失而重用。
完整Server收敛目标尚未完成，成衣正式采集、关账与运行切换仍须各自前置。
