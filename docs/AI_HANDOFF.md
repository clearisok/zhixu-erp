# 当前恢复点：D143 两合同固定预算采集

2026-10-16；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。原ainuoke-live-readiness工作树、feat/ainuoke-selected-source-once；clean parent PR115@db4236cf63839e4f384ad042e1ac21ad42fd01f1，原ref保留，不新建树/重复PR/合并/部署。基线receipt在outputs/selected-source-once-baseline-20261016.json。前接力逐字归档tasks/completed/2026-10-16-payment-operator-delivered-ai_handoff.md。

先读tasks/active/ainuoke-selected-source-once.md、D143、AINUOKE_SERVER_SOURCE。新Python预算包住原collector/SDK而不是重写mapper；Node严格结果验证再用previewSelectedBindings/validateBundle。内部函数没有DB写入或新HTTP/CLI/scheduler。每次两合同、1登录80报表81HTTP180秒、0重试/续期；每页50/每报表20页1000行/全4000行，4MiB响应32MiB输出。颜色contains结果逐行精确BillNo，材料逐行ExpContractNo。

新增11项Node/实际Python stdout/一次性PG和15项Python通过，全Python129通过；类型/定向lint通过。合成并发首绑仅两SO，既有四流持久化读回；理论115.50与采购118保持独立，空单位/未知量不补0。原失败日志保留，真实0读取。继续完整Source/continuous回归、root/94基线/类型lint构建、提交源码/冻结前向证据、精确main守卫，再按已证官方IP进程级Git路线安全一次push、核精确head/唯一依赖草稿/三CI及COMMENT复审。

PR115远端db4236cf三CI已全部SUCCESS：baseline116813381526、team116813381195、source116813380536；复审5543197142，仍草稿/未合并。原0026证据不改。D143修改决策文件后须新证据叶supersede decisions-payment-operator、绑定新Git blob；旧ID/报告/PNG/hash不可覆盖。当前dirty全为本Phase已知增量，没有继承dirty。

旧真实财务两合同一次许可已用完，禁止新增读取/凭据文件/真实DB/首绑/激活。旧四单窗口不续，旧演示两个容器已停止且保留volume，未重启。下一步先提交精确隔离资源/SO/合同/预算/期限/备份回退方案，明确授权后才真实操作；宁波18443/18444不触。Goal仍在进行，完成前须按D121 Gate0–5审计未交付/未授权项，不能因当前CI绿标全部完成。

2026-10-16第二个源码checkpoint：新增真实父进程调用测试，验证collectWithPython接受成功与非零封闭失败，计数不丢失且不重新采集。新增安全响应超限/重定向分类，不反射原错误。Node/实际Python/一次性PG12/12，Python全130/130（本阶段16新增）通过；continuous70PASS/1既有Windows条件SKIP，类型/Server编译/完整lint通过。完整root在新决策证据尚未绑定时提前启动，实际结束因EVIDENCE_WORKTREE_DRIFT decisions-payment-operator失败，不能记PASS；没有进程被停止，原日志保留，绑定后完整重跑。原源码e369已安全一次push并独立API核实送达，无新PR/真实操作。e369隔离构建镜像已成功，仅构建未运行；后续诊断分类源码另有checkpoint，不将该镜像冒称最终源码。

前述root实际888PASS/10FAIL/0SKIP，十项均因新增D143后决策叶尚未前向绑定，不是产品领域失败；保留日志，不能冒称通过。第二源码类型检查另发现工具自建Docker archive位于outputs，被TypeScript全路径glob当作第二套源码，产生归档worker/D1类型错误；未改应用tsconfig或放松检查，将此唯一自建归档非破坏移至已核绝对TEMP目标，重跑类型通过。原上下文及日志均保留，下一构建直接使用TEMP。
