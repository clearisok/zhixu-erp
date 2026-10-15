2026-10-14整合：保留PR108完整能力和预检证据链修复f5bbb1e；本机真实演示分支整合验证中，未合并main/未更换运行镜像。PR108原状态归档[2026-10-14-pr108-CURRENT_STATE.md](tasks/completed/2026-10-14-pr108-CURRENT_STATE.md)。

# 当前状态

核实2026-10-14；main基线064e3afaf7d08b3cb62907d4402f97d9c292f1e5。GitHub是实时工程源；本轮沿用已核实main对象，未fetch。PR108最近核实OPEN/head8b89de59dd405395da1dde4b6dde5f125141deb9，未合并。

- **本机真实隔离演示已打通4单**：用户明确授权新独立账本、62310、四单首绑及两轮真实刷新，已执行完成。应用source SHA b95dbb3e2fd16137ade810b20781a9cdbc742be1，正式Server/session/snapshot；独立Docker数据库/volume，数据库不发布端口，应用只127.0.0.1:62310。未改变旧模拟演示、宁波或18443/18444。
- 四单最新物料147项、161来源行，均有采购/入库/出运/出库；两轮真实快照持久化。具名待定颜色0/原始空值、数量0/单位为空提醒、两项匹配新鲜来源的人工单位/工厂责任确认已经在这个隔离目标显示；不是全558单绑定或正式生产激活。
- 六演示角色读取/退出验证通过，8个真实浏览器场景通过，0横向溢出/Runtime错误；第三轮采集、错误目标和重复初始化均被阻断。**未开长期scheduler**；用户新授权四单每10分钟运行2小时，已启动13:12–15:12有界窗口，最多12次，首轮成功。到期自动停止，来源超过30分钟仍诚实提示过期。
- 真实源单位/理论/采购保持独立，不把两次有效采购去重。发现用户历史理论115.50与报表TotalNum116（旧原包亦116）差异，未自行改值，后续IT核实口径。退库/取消治理、剩余单位补充、Excel配置导入未完成。
- 当前feat/ainuoke-anomaly-evidence保留D116–119候选与右上角退出菜单。独立报价转订单分支a0e60e4e83cf67bfa22c36234c5dd9bf4495689d不变。远端交付仍待恢复，新PR/CI未建立；本机工程与运行证据不冒称GitHub已送达/合并。

[实机证据/镜像/目标指纹/限制](tasks/active/ainuoke-isolated-live-results-2026-10-14.md)；[原小范围绑定工程](tasks/active/ainuoke-selected-first-binding-verification-2026-10-14.md)（root839、baseline73、持续69pass/1Windows skip）；[上期状态完整归档](tasks/completed/2026-10-14-before-isolated-live-execution.md)。真实单据、原始快照、截图、凭据与登录说明仅在受保护Git忽略目录。

更新时机：main/PR、代码、授权、真实采集、环境或人工业务验收变化。
