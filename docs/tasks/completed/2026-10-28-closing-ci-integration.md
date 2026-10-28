# 关账累计候选的必要CI接线

2026-10-28；`feat/closing-support-interfaces`，本阶段输入 `8752729f17b191e5dd32a265de5effcf858f601a`、工作树干净。该输入的main守卫已实际PASS，基线 `6479a713e2b80228f008049519ebbd50d10601a8`，12页/68能力/38个UI路径、errors为空；原回执 `executor-recovery-commit-guard.log`，不是Hosted CI。

审查现有三项必要工作流：均仅PR/main和手工触发，没有同时push/PR重复触发；已具备取消旧PR运行的concurrency、npm锁文件缓存和15/20分钟超时。本片不新增workflow/job或缩减质量门槛，不批量重跑历史失败或复跑成功CI。

现有source工作流已跑关账主链，但遗漏后续0052模型/SQL/恢复目录负控，以及已实际验收的配套界面18项浏览器流程。本片在同一source job中各加入一次，复用原Server/前端构建和既有依赖：

- 0052模型、owned PG恢复/SQL及0051/0052目录保护检查。
- 现有 `closing-adjustment-ui.integration.test.mjs`，以 `CLOSING_UI_EXPECTED_SOURCE=github.sha` 核对本次明确Server构建；Ubuntu step显式 `CHROME_PATH=google-chrome`，不落到该夹具的Windows默认路径。

没有新真实Source、持久镜像或运维请求，也没有把完整镜像恢复加入缺少精确镜像的CI。20分钟上限、原concurrency及缓存不变；实际Hosted时长尚未测量，不承诺新增检查没有费用。

验证：最初探测不存在的可选 `yaml` 模块失败，未安装；随后用已有锁定 `js-yaml` 完整解析成功，并核对唯一事件/单job、原超时及两项检查各出现一次。原失败与成功日志分别为 `closing-ci-yaml.log` 和 `closing-ci-yaml-locked-parser.log`，不隐去失败或声称有新的应用测试。业务产品仍a198，相关本地18实机及0052模型/SQL、最新owned恢复8项结果按其精确源码复用，不为接线重复执行。

独立只读reviewer检查新增调用不与既有npm清单重复，构建与浏览器均绑定github.sha，Ubuntu浏览器路径明确，无P1/P2；未执行测试、联网或Hosted。本片最终精确守卫在checkpoint后核对 `closing-ci-final-guard.log` 实际结果，不预报PASS。

远端尚未交付，新PR/Hosted CI仍0；获准a027的一次实际push已经耗尽，不能因工具本地预算修正自动新增写入。后续仅一次精确上传并在远端核实后创建唯一草稿PR，让这次必要CI运行；不另行手工dispatch重复检查。累计PR包含0045–0052，335个路径统计绑定875，不能当作三个按钮的小改动。独立工具分支仍单独保留。

本片无应用/SQL/权限/UI/依赖变化，不合并、正式部署或修改既有数据；a198镜像TLS失败、新持久恢复/空候选等边界见[恢复工程](2026-10-28-closing-executor-recovery-engineering.md)。
