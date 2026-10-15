# 既有四单两小时窗口完成回执（只读复核）

核实2026-10-15；GitHub main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；新阶段feat/material-progress-integration从036fe521ba16a7b5193d1c68cc1f6cc76626709a/clean开始。源分支feat/ainuoke-anomaly-evidence/head21da670b619f9ad745b4818ffc0a4eb50b9a501e及原工作树保留。GitHub为实时源，本文是历史窗口日志的阶段性复核。

用户原授权：固定四单、每10分钟、两小时、到期停止。只读原工作树outputs/active-live-private-path.txt所指受保护目录的window-final.json及window-*.jsonl；不读取operator/config/凭据，不打印实际合同或run ID，不启动任何Source或写库。受限环境拒绝读取不代表文件丢失；提升只读后成功，ACL未改。

结束回执WINDOW_STOPPED；日志26条=started1+attempt12+result12+stopped1。开始2026-10-14T05:12:09.685Z，预定截止07:12:09.685Z，结束07:12:09.695Z，间隔600000ms、maxAttempts12；12次均SOURCE_CAPTURED、每次orders=4、12个不同run ID、replayed=0，stopReason=deadline/attempts12。北京时间13:12–15:12，调度按期停止。

这证明既有操作工具记录了四单12次成功采集/发布结果及截止停止；本轮没有独立重新查询12份DB快照或逐行业务核对，不能扩大为全部合同、银行付款、人工业务验收或新持续运行许可。原Source分支记录的应用b95dbb3、operator b0882fe仅是其当时时点，不是本轮重新检查了当前容器/应用版本。

本轮新HTTP请求0、数据库读写0、凭据读取0、ACL变化0、部署0、窗口重启0。到期后旧应用若仍展示历史数据，必须诚实标注过期；不得由此自动续期、扩单或迁移宁波。私有日志和真实业务字段不进入Git，仅此脱敏结果。

更新时机：有新的明确授权窗口、实际运行证据、main/部署/验收或发现日志不一致时；保留本日期/原窗口范围与限制。