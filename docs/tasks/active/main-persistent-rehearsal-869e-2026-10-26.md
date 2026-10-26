# 当前main持久化候选与隔离恢复演练

2026-10-26；main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T03:01:20.985Z独立API核实。branch codex/main-persistent-rehearsal-869e从该main干净建立，普通合流已审harness分支fbfecb5753138406404df0307e7c15318cebd73e并保留原历史。镜像仅从精确main canonical archive构建，测试runner第二副本仅覆盖原已审harness；未合并的H/4B/G5/资源/计划/执行/物流/出货代码不进入本镜像。

## 范围和验收计划

复用原fbfecb的prepare归属、项目网络及受保护端口修复，harness blob为f03ac2adcb7aa27695565ade10c788a070161144。旧M镜像8/8只作历史，不能冒称新N已通过；本轮先逐blob核main archive/31份SQL，再单次build及单次实际镜像8项演练。只有完整8 pass/零fail/skip/cancelled及前后保护回执成立才算通过。

覆盖空schema显式初始化、TLS/对象凭据/桶负测、合成Quote/PNG、重启/冷重建、原备份工具和独立DB+对象恢复。应用/ops运行脚本/SQL不修改；测试工具修复以独立runner身份记录。最多一次构建、一次实际演练，不以网络问题无限重试，不关闭TLS/包签名或安装host依赖。

只操作本轮两个全新、成功prepared且归属可证明的合成项目。旧容器ID/镜像/状态、网络及所有卷名单在前后只读比较；不读现有config/环境/业务内容/密码或Source私密报告。保护3001/50426/59069/62426、其他旧入口/数据库/对象/卷/备份/Browser。成功后只允许原harness清理本轮自有测试资源；失败保留现场，不重复准备、构建或演练。

准备时记录：镜像build/8项演练/最终guard尚未发生；该时点不提前PASS，后续实际终态见下方；以outputs/main-persistent-rehearsal-869e-20261026同源码/同HEAD实际回执为准。旧[演练记录](main-persistent-rehearsal-2026-10-25.md)保留原M/source/hash/结果/限制。

PR129已经单独批准合并；本阶段不合并/关闭其他PR，不切换现有入口、不部署正式环境，不采集/绑定/激活/调度Source。H精确交付授权仍保留，Execute/Push/PR/Hosted为0；普通PowerShell同样TLS失败，当前不再探测未改变Git通道，不改共享代理/TLS/认证。所有其余分支、旧结果、卷和备份保持；完整G1–G8/R仍active，人工接受/入口切换/退役及关账业务决定未完成。

正式PR交付仍须当前精确base源码守卫、发布134及必要三CI；本轮不重复未受影响的全仓质量或功能测试，不把历史结果称为新执行。

## 本轮实际终态

main 869ee84dd0b31de6161011e4aa560678b244a64d于2026-10-26T03:01:20.985Z独立API核实；branch codex/main-persistent-rehearsal-869e。镜像zhixu-persistent-main:869ee84d-20261026-bc578ef252，ID sha256:2d0f81a0831fa1490088bde9d3dde9ec6e56dbbe2000edf175c14f2e16037ffa，buildId server-main-869ee84d-20261026-bc578ef252，buildTime 2026-10-26T03:01:21.443Z；单次构建62884ms。原Git tree 6f1247dba4c6a3bd3e7077db896ea374f609ab84，archive SHA256 28acd1e2dfce4130c9762ebe05bfc577be44be5f08e6b8445878488a552244fc，2373个文件逐blob核对、canonical LF、31份SQL。

一次实际镜像演练8/8 PASS（338820ms），零失败/跳过/取消，包含归属保护单测、6个实际子阶段及父项。新库显式初始化31份迁移；合成报价、管理员hash内部比对、PNG字节和账本在重启/冷重建及独立DB+对象恢复后保持。对象错误CA/凭据/桶、重复准备、活动writer备份、篡改、可写恢复bundle和对象冲突负测按原阶段检查通过。

应用镜像完全来自main N；runner第二份同archive的2373个文件逐blob核实，只overlay已审harness f03ac2adcb7aa27695565ade10c788a070161144（原main harness adf242523a3134676dd4528bf14c414311c1c979）。应用、Dockerfile、ops运行脚本、SQL及UI无改动；与未合并G6C/交期/物流/出货代码隔离。新结果不冒称旧main测试原样重跑、导航像素、真实Source或用户业务接受。

本轮前后核对50个既有容器ID/镜像/状态/健康、179个卷名及27个网络ID/名称/driver均保持。该结论仅限所列元数据，不是对旧业务内容、迁移账本或入口可用性的查询。仅两个新建且prepared归属可证的测试项目被重建/恢复；成功后由原harness清理本轮资源，旧环境/卷/备份/失败现场保持。

本阶段没有切换3001/50426/59069/62426或开启新常驻入口，没有读取现有config/凭据/业务数据、采集/绑定/激活/调度Source、合并/关闭PR、部署正式环境、Git push或Hosted CI。PR129已单独批准合并。H精确恢复授权继续保留、Execute/Push/新PR/Hosted仍0；Git通道没有新可用状态，不重复探测、不改共享代理/TLS/认证。

原始build/TAP/保全证据见outputs/main-persistent-rehearsal-869e-20261026，镜像、runner和结果身份分别保留。最终commit/精确N源码守卫及独立复审以同目录final-checkpoint.json核对，缺失不算通过；不为了写自证SHA反复重跑。正式PR发布134和必要CI仍保留，本轮未重复未受影响的全仓类型/功能测试。完整Goal G1–G8/R active；现有目标升级、人工接受、真实来源范围/激活、关账三问和旧资产退役仍独立待决。
