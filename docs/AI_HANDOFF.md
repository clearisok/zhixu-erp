# 恢复点：main镜像隔离恢复已PASS

2026-10-25；branch codex/main-persistent-rehearsal-9d65，base 9d65c868e0cef966a6b8ccbdc5eb048eeac36ddf。镜像zhixu-persistent-main:9d65c868-20261025-09831663ee，source为main，构建一次通过；8/8真实镜像演练325770ms通过、零跳过，31份迁移。旧50容器身份/状态、179卷保全通过。

runner只overlay保护修复的harness，blob f03ac2adcb7aa27695565ade10c788a070161144；原Dockerfile/ops运行脚本/SQL/应用/UI未变。已保存rehearsal-result.json/TAP/preservation.json；不要重启成功演练、重新构建同输入或清理旧失败项目。最终commit/守卫/复审读outputs/main-persistent-rehearsal-20261025/final-checkpoint.json核对同HEAD，缺失不视为PASS。目标lint与文档校验已通过；134/必要CI留在未来真实PR门槛，不冒称本轮跑过。

保护分支：b611c61f65227113b6203d23a1a0fe46cce4537b保存完整G1–G8/R就绪审查，7da954545bd9b720bfc28edbd313bc387dd5c195保存累计成衣工程，db683892e7c90df3ea81c4b8162dd2aa36a3d03a保存独立CI成本控制。均未被本main基线分支删除、合并或部署。

PR129仍唯一草稿，精确d1917aaf91f6bfde5904e4f49dc1b6fd82599680的原三CI通过，具体merge待用户答复。Git STOP原原因UNRESOLVED；不上传其他分支、更换认证或自动合并。真实Source额度/target启用、关账三问、可见coverage V2、62426/50426切换、用户接受和旧资产退役继续独立待决。

未替换62426/50426/3001或新开持续体验/Source。读[阶段记录](tasks/active/main-persistent-rehearsal-2026-10-25.md)后沿完整G1–G8/R继续；候选隔离验证不代表Goal完成。
