# 合同货款申请来源面板工程与截图证据

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5再次connector确认，未据此宣称Native Git恢复。报告随此checkpoint冻结，manifest绑定其完整SHA；后续结果前向记入任务，不覆盖本报告。

已确认：沿D121/D134/D139的独立合同来源观察与现有对账tab，复用Foundation/Drawer/只读表格；不改变物料主列表、四流、排序、主题或导航。明确合同级、未关联当前物料、分批不合计/申请非实付。十行分页保留127来源记录，逐行展开四数量、十二金额、各单位/币种和原字段/本次来源页行；精确小数文本、0、缺失、负调整和完全相同来源行分别保留。没有自动CNY/个、数量计算、财务事件去重或CCT读取。

客户端与服务端wire v1显式时间/schema，对32MiB响应有界、关闭重定向、仅同源GET/no-store；SO/合同/页行/数量/单位/追踪严格校验。服务端evaluatedAt加全请求/解析延迟计算保守单调寿命，浏览器Date.now设0仍按时隐藏金额；订单/身份/权限/失败清旧响应，关闭/切换取消，恢复焦点/可见只重读织序DB。客户端不承担授权或hash证明；后端权限、不可变证据和目标默认关闭仍是边界。原0025迁移及数据库规则未改变。

实际验证：最终150/150（27客户端＋104原探测/纯模型＋19一次性PG/API），实际API响应逐行经客户端严格parse；重复原行、恶意schema/银行状态/CCT字段、混合同/伪单位、过期/错误时钟/超大流/UTF8/取消均覆盖。typecheck、Server编译及完整源码lint通过。显式Server snapshot UI完整源码cefe951d1de1a32763a1e7298e69b2560b1c282d，build20261015-231629，串行build与server:build通过；后续仅测试/CI/文档变更，没有新产品代码差异。

实际Chromium：原material-display UI9/9通过；新payment-read-panel UI9/9通过（最后expanded-fields run）。1920、1536/125%、1440、1280、900、390；页面无全局横溢，手机Drawer占满视口，宽表只在局部横滚。手机/桌面展开精确金额单元格已checkVisibility并滚入截图；七合成角色均可读Source且不请求Quote/CCT或Browser回退。仅打开tab GET；分页不再取数据/不汇总；到期隐藏且不新增请求；启用版本变化清旧数据/重新发布；实际DB撤权后已有会话也不能继续显示；迟到结果不回填采购tab，Escape恢复触发按钮焦点。没有上游艾诺科读取。

人工视觉检查：已用本机图片查看器核对1920、390和390展开字段，现有侧栏与局部滚动可读；这是AI工程检查，不是用户像素验收。新九张PNG位于docs/tasks/assets/payment-read-panel-2026-10-15，独立新路径/ID；receipt有实际构建身份和六宽度测量，不覆盖原P6/B2或首轮失败截图。

失败/修复保留：首次render读performance.now触发React纯度lint，移至异步接收/定时而非禁规则。两个编译共写dist/server/features引发ENOTEMPTY，改串行通过，不清理业务数据。首次新UI7通过/2失败（含父测试），是采购tab带数量导致测试精确文本未命中；修为角色tab计数标签，保留取消/焦点断言并增加展开可见/时钟偏差检查，最终9通过。原日志和首轮截图不改。vite默认git --short且旧CI未显式SHA，按代码推断新增元数据断言将拒绝；CI设置github.sha，非宣称已观察Hosted失败/成功。

完整root/基线、默认Browser构建与最终精确main门禁在任务后续登记。真实过滤/分页、目标SO授权、采集器与真实迁移/写入/激活仍待，不凭此模型/页面/verification hash认定获授权；首次接纳仍必须可信Discovery，不由财务数据建SO。未动真实账号/业务DB、原私有报告、现有演示、宁波18443/18444或旧Source窗口；不合并部署。Git NETWORK_DEGRADED，不自动恢复推送或认证。

本机日志：outputs/payment-panel-{client-api-final,browser-first,browser-second,browser-final,original-material-ui,server-ui-build,server-ui-build-serial,server-build-serial,full-lint}.log。全部财务数据/截图均为新建tmpfs PG与独立Chrome profile的合成记录，未上传真实财务/Excel/凭据。
