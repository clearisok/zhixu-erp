# 精确main持久化镜像与隔离恢复演练

2026-10-25；branch codex/main-persistent-rehearsal-9d65，实际main 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf。从main干净建立；前一CI分支db683892e7c90df3ea81c4b8162dd2aa36a3d03a已提交且保留。没有继承dirty，不把未合并导航、交期、生产或成衣代码混进本镜像。

## 构建身份

main原Git tree b1abcc6d8d6b7ce6e228d081582c878a3b1cdb61，原始archive SHA256 74959c7c94f2f72864055cdef7a5989cf44735e4d2b08c53aedebd33855d5978；提取后全部2346个文件逐一核对Git blob，使用canonical LF，不读工作树ignored/私密数据。31份迁移（最高0032、缺0013）是源码事实，不推算当前旧目标账本。

镜像 zhixu-persistent-main:9d65c868-20261025-09831663ee，ID sha256:015c6e30d7d80864de7b5eefbba6228db6b19889bf7020f9737d2805ca0c8fc3，buildId server-main-9d65c868-20261025-09831663ee，buildTime 2026-10-24T18:16:09.845Z。原Dockerfile未改，以缓存node22-alpine及已有ustc构建参数构建，TLS/包签名不关闭；本机/daemon/代理/系统信任不修改。一次build通过82674ms，source与server/session/writable等labels核对通过。没有重标旧镜像为main，也没有安装host依赖。

## 测试工具修复

演练前独立审查发现原harness在prepare-local拒绝时仍可能尝试stop/down，随机nonce不是归属证明。本分支仅调整现有测试：

- 首次prepare前只读排除同名_default/_ingress网络及同Compose项目标签网络；冲突立即停止，不能清理。
- 只在成功回执的project/operation/result精确匹配后标记prepared；after仅允许清理本轮已prepared且在owned名单内的项目。部分初始化失败保留现场。
- 固定排除Gate0受保护入口及数据库端口，包含当前未监听的62310/62200等。
- 新增假compose回归覆盖未prepared两种终态均零命令、已prepared失败仅stop/成功仅删本轮卷、非owned项目拒绝；网络同名/同标签拒绝、不同项目允许。

应用镜像仍完全来自原main。演练runner是第二份同archive，仅overlay新harness，准确blob在outputs/main-persistent-rehearsal-20261025/rehearsal-attempt.json；原Dockerfile、ops运行脚本、SQL及应用源未改。新结果总计应为8项：新增1保护单测，加原6子阶段及父项7。不能称原main7项原样重跑。

## 实际验证与边界

目标ESLint、无镜像保护单测1PASS（实际镜像测试当时1SKIP）与diff whitespace已通过。当前实际镜像演练状态由同目录rehearsal-result.json/rehearsal.log的终态核对；回执不存在或非完整8PASS不得视为通过。最终结果会在本阶段收口前明确写入下方记录，原失败不掩盖。

This phase builds an exact merged-main image and uses only new owned synthetic projects. Existing environments, users, business databases, networks and volumes are protected. No Source credentials, old private reports, collection, activation, scheduling, persistent target replacement, remote write, merge or Hosted run.

现有62426保持旧8175构建；50426此前只读观察无监听且原因未知，本轮不自动修复入口。重启/恢复只针对本轮两个新建、明确prepared的合成项目。合成管理员、报价与1张PNG只写入这两个测试库/对象存储，成功后仅按原harness清理本轮测试资源；失败保留其私密资料。当前179个既有卷及原容器身份另做前后只读比较，不读取其数据。

完整Goal仍为G1–G8/R。b611c61f65227113b6203d23a1a0fe46cce4537b保存当前能力/运行审查，7da954545bd9b720bfc28edbd313bc387dd5c195保存累计成衣工程，db683892e7c90df3ea81c4b8162dd2aa36a3d03a保存独立CI成本控制。它们都保留，不因本分支从main建立而被删除、合并或部署。

PR129仍唯一草稿，精确d1917aaf91f6bfde5904e4f49dc1b6fd82599680的三项原CI通过，具体合并问题已发出且未收到答复。Git STOP原原因仍UNRESOLVED，不为此阶段推送或更换认证。真实Source额度/target启用、关账三问、可见coverage V2、现有62426/50426切换、用户接受及旧资产退役分别待决。

未触发新HostedCI、dispatch或rerun。此测试/文档阶段不重跑未受影响的全仓UI/API套件，不冒称新类型/全量测试通过；真实PR交付前134和必要三项CI仍保留。最终base源码守卫/独立复审与commit按同目录final-checkpoint.json核对。原main状态和所有旧日期/hash/限制保留于[精确main状态](https://github.com/clearisok/zhixu-erp/blob/9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf/docs/CURRENT_STATE.md)。

## 本轮实际终态

同一精确main镜像的单次演练已全部通过：8 tests / 8 pass / 0 fail / 0 skip / 0 cancelled，325770ms。包括1个harness归属/网络单测，以及6个实际镜像子阶段与父项。实际初始化和恢复均观测31份迁移；报价ID、完整快照、管理员hash内部相等、PNG字节、账本在重启/冷重建及独立DB+对象恢复后保持。错误对象凭据/CA/桶、重复准备、活动writer备份、篡改、可写restore bundle和对象冲突均按原子阶段拒绝。未修改已有应用/ops运行脚本或SQL，也未把该结果称为真实Source/用户业务验收。

演练后只读比较：原50个容器的ID/镜像/运行状态保持，原179个卷全部仍在。仅本轮新建成功的两个合成项目及其测试备份按原harness清理；原失败演练项目、所有现有卷和旧备份保留。保全回执preservation.json不含凭据或旧业务内容；原TAP保留于rehearsal.log，镜像构建与runner blob各有独立回执。

完整Goal仍active；这里是候选构建和隔离验证，不是62426/50426切换、部署、人工接受或旧环境退役。未新触发HostedCI。
