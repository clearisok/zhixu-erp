# 登录、报价、订单与物料的统一本机演示

核实2026-10-12；main 3456fe5fc6e213c2e896e4e6a509e28751f1798c。随组合代码、PR、验证、人工验收或演示方式改变更新；GitHub是实时事实源。

## 用户决定与已确认事实
- 用户原话：“登录页可以，合并 PR #101，然后把 PR #100 的订单、物料功能整合到同一个本机演示里，让我完整体验。暂不部署，也不要修改真实账号或数据库。”
- PR101 head caf99c35b82d6c2f633209dd2385869ffeb8ea54 三项 CI SUCCESS、MERGEABLE/CLEAN，于2026-10-12T11:56:09Z按授权合并；merge SHA见本页main。用户接受登录视觉，不扩大为业务或真实环境验收。
- PR100 起始 head ba6ec973c4e7c5d884505990cb1db2e1d5861de7，独立工作树clean；fetch成功并将上述main整合至原分支，保留唯一PR100，不合并它。
- 同一个构建保留 isEnabledServerRoute 与 LoginRedirect/SessionLogout；登录成功安全返回原订单或物料链接，原报价/订单/物料/导航样式保持。生产排单和关账等未接通路由仍关闭。

## 演示范围与操作
按 features/AINUOKE_SERVER_SOURCE.md 的五个显式 Server/session/snapshot 构建变量构建，再执行 `npm run demo:ainuoke-continuous`。脚本输出唯一随机本机网址，入口 `/login?returnTo=%2Forder-center`。
合成账号：demo.admin、demo.manager、demo.quote、demo.material、demo.production、demo.finance；仅演示密码 Synthetic-Demo-2026。真实用户名及密码不使用、不修改。
体验路径：登录 → 订单中心 SC-SYNTHETIC-001 → 执行详情 → 查看物料跟进 → 展开材料 → 采购/入库/物料出运/物料出库；左侧可切换报价中心 QT-SYNTHETIC-DEMO 与既有设置。制作参数未配置保留待完善，不伪造真实方案。
每60秒生成下一代合成来源，采购单号尾部G序号增加；页面30秒读取，最多约90秒可看到变化。这不是艾诺科真实连接。退出后重新回正式登录页，可换角色。
脚本始终自建唯一 loopback/tmpfs PostgreSQL，不读取真实 DATABASE_URL；附件仅临时内存。两小时到期或Ctrl+C关闭自己的API/临时数据库。不同启动间不保留演示内容，不影响Browser原有数据或真实环境。

## 检查与结论
组合UI9/9、登录UI10/10、六角色UI5/5、会话112/112、root810/810、发布基线71/71与实际main校验通过；类型/lint/server及候选build通过。continuous在Windows29通过/1Linux限定跳过，当前Linux CI单独核实。完整结果及复审见[冻结证据](evidence/unified-local-demo/engineering.md)。
旧证据保持不可变；截图仅生成到ignored outputs/unified-local-demo，后续按新路径冻结需要保存的证据。

## 仍未确认/未实施
未连接真实艾诺科；首次真实绑定/持续运行/新增合同与主镜像颜色增量/完整候选镜像/备份恢复/宁波上线仍是后续Gate。订单物料当前只有合成工程验收，等待用户体验。
PR101扩展Quote UI回归在旧main与候选均69/78（8相同失败加父测试），见冻结 quote-regression-comparison.json；本任务不冒称修复这项历史问题。
