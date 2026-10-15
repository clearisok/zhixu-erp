# 接力：Gate5独立多余仓只读映射

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5。沿用原工作树，B1在af9b7462b739fff45c84702883cd799b0e6871cd干净收口；另起feat/ainuoke-excess-warehouse，不重复工作树/PR。用户确认31条之外另有1条，单位条；D133和scope记录已更新，真实标识不入Git。

Projection+独立helper按入库sourceReferences读取num_dyc，DTO独立字段，缺/非法/冲突/混合缺失/单位不明均有状态，不累加、不改rknum、TotalNum、cgnum或正式齐套。初轮13项新负向/数量保护与旧回归共68PASS；另补大小写/别名冒用，最终新增14/14PASS、类型/lint PASS；旧包13合同与Discovery一致、4空、386行、366入库事件，117known/249missing仅历史离线事实，269是原行缺键数，不能混淆。最初离线工具对4空合同无法从首行推身份而拒绝，改用同一可信Discovery核对目标，未放宽产品校验。后续浏览器与最终根/基线/证据待收口。

B1既有21UI PASS，随后加工批次9/9UI PASS。G1–G4 PR109–112各3CI全绿未合并；G5/本字段没有远端交付，NETWORK_DEGRADED不自动恢复或push。此前完整PhaseA及B1历史证据保留；待字段完成后回原G5分支继续B2排序/团队设置/事件侧栏，6086941独立来源。无新HTTP/凭据/真实DB/ACL/部署、宁波18443/18444或既有窗口操作。Goal未完成。
