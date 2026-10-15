# PR109：未确认翻单准备的原请求恢复

核实2026-10-15；GitHub main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5（本轮GitHub commit API重新核实）。沿用既有工作树及feat/order-identity-and-contract-claim，从1fcc440f00eeab962eb766161eab96ed5f67c6b4/clean开始，无继承dirty，无新工作树或重复PR。随源码、测试、远端或验收范围变化更新；历史失败和日志不覆盖。

## 已确认问题

后端actor/request唯一约束和payload校验存在，但页面每次点击建立准备都会清空内容并生成新requestId。若服务端已提交、响应丢失，用户关闭弹窗再打开便丢失原身份；重新填写后可形成第二条准备。它不直接创建SO，但违反已批准的原请求重试约定。

本轮在实际生产候选、真实可信合成session和一次性PostgreSQL中拦截首个成功POST的浏览器回执：数据库确认已增加一行，客户端收到网络失败。关闭重开后的数量实为''而不是原234，新增测试在原源码确定失败（4PASS/2FAIL含parent），非仅凭源码猜测。日志outputs/pr109-preparation-retry-repro.log为本机忽略产物。

## 最小修复及独立复查

只在没有未确认请求时重置表单、生成新requestId；请求处理中禁用另建入口。未确认时重开同一弹窗保留原数量、交期、规格说明和请求号，仍禁止修改原payload；成功回执后解除未确认状态。无新布局/导航/颜色/控件模型，不修改服务端SQL、业务数量、来源身份、流水或正式SO创建规则。V1精确路径见docs/release/ui-changes/order-preparation-retry.json。

同一测试在修复候选通过：先核服务端确已提交，关闭重开核表单保留及禁改，然后重试，两个POST的完整payload相同，数据库仅增加一条准备，正式SO数不变。其余认领/血统/转交、只读角色、1440/390宽度控件仍通过，共6/6。完整typecheck、增量eslint、显式Server/session/snapshot/writable构建通过。没有覆盖历史截图或改变默认运行路由；未输出新像素批准结论。

额外代码复查：sourceId及合同号在repository写入前NFKC/trim/大小写统一；可信绑定和受控新增路径事务内重新检查权限、来源与预览，未发现所怀疑的全角/空白绕过。认领CAS、转交目标权限、间接循环及审计回滚已有领域集成覆盖；本轮没有为未变化的路径重复标注新执行PASS。

## 证据分层及限制

GitHub workflow API确认旧1fcc440精确提交的Release baseline(38664130099)、Ainuoke server source(38664129942)、First team access(38664129923)均success；它们不是本修复CI。两次PR详情connector查询Transport closed，故本轮不重申最新mergeable状态。main已单独核实064e3af。

当前修复的项目回归、发布基线、精确main守卫在本阶段收口记录，未执行之前不得预写通过。Git仍NETWORK_DEGRADED，不自动恢复推送、不创建重复PR；最终提交后只有核实新远端SHA/CI才算交付。暂不建议合并旧PR109 head，本修复应先送达并通过CI。

未确认状态只覆盖同一挂载页面的弹窗开合，不声称整页刷新/跨页面/跨设备恢复。准备重复与正式加工批次的唯一消费是不同边界，后者由G3后端处理。本轮不增加Browser存储或混入后续Gate；G1共享CCT仍须G2替换。

只使用合成账号、一次性tmpfs测试数据库和新临时Chromium profile；没有读取艾诺科凭据、HTTP报表、真实数据库、首绑、调度或部署。Source工作树feat/ainuoke-payment-contract-probe@48b63101675f7773b63c7d820d4c1d60088ed9b4保持不变，真实两合同核验仍等待独立授权。

本轮构建元数据指向起点1fcc440，实际构建含本Phase未提交增量，不冒称旧head的原二进制。所测源码LF规范化SHA256：

- features/order-center/components/server-order-preparation-card.tsx：f75bce79eca3dfade8163de3c464b479ff602e7b888293c5c9d6b9a0597c6eb6
- server/integration/order-identity-ui.integration.test.mjs：4fb7dff96e08ebe49dbd2d133ddf0d3f3801fa55d6455ceaa8988605f2bb25af

本轮root817/817通过（outputs/pr109-preparation-retry-root.log）；旧相关数据库领域测试仅引用历史证据，不重复标记本轮执行。

收口结果：发布基线71/71（outputs/pr109-preparation-retry-baseline-regressions.log）与main064e精确守卫PASS（10页/16能力/7继承UI路径，outputs/pr109-preparation-retry-guard.log）。守卫含working增量；提交后再次核实精确HEAD及clean状态，不将旧CI当作新提交验收。
