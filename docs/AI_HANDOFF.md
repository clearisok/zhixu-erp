# G5 B2 源码检查点（未最终验收/未交付）

2026-10-15；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；原order-effective-attribution工作树，feat/material-sort-and-event-drawer从多余仓aab97cb8/clean继续。模型7/7、设置API/隔离升级20/20、客户端/默认关闭路由6/6、类型/新源码lint已通过。源码含0024团队设置、actor幂等/CAS/审计、可信客户端/页面、辅料排序、颜色规格展开及事件Drawer；正式数量/去重/齐套/CCT不改。新六宽度七角色浏览器测试已编写，精确构建/执行、完整回归和基线冻结待完成，不推送本WIP。

D134与新批准范围需要在此源码checkpoint后前向冻结manifest；旧D133与所有PNG/证据保留。新UI路径已记录。不要改截图哈希消除错误。当前尚未完成G5，不认为人工视觉验收或真实使用通过。

用户授权的G5 af9b746与num_dyc aab97cb8恢复尝试仍预检失败，pushes0，远端branch/PR未出现；进程OpenSSL只读成功不代表恢复。已停止，不再撞同通道。G1 PR109@1fcc440、Draft110@3deffc4、111@f4a1b99、112@036fe521均此前CI3成功未合并，合并授权仍待回复。旧Source21da/108包含在累计分支，未来PR目标main且声明依赖，不建议直接累计合并。

禁止真实账号/业务DB、部署、宁波18443/18444、新Source读取/激活或延长既有四单窗口。既有窗口12/12已截止。Goal继续，下一步精确构建和真实隔离Chromium，失败查原因不放宽断言。

首轮B2隔离UI在fixture Source完整性校验被拒绝：新增合成行漏了既有6087050:sha256身份前缀，尚未进入页面；仅修正测试样本，不放宽守卫。最小发布门禁另发现新设置page id未登记，新增implementation-only页面和精确impact引用。失败回执保留，下一轮继续实际验收。

B2第二轮UI6PASS/3FAIL（含父测试）：真实七角色、保存丢响应、并发冲突、撤权、侧栏四流/多余仓与刷新失败均通过；两个失败是测试选中所有卡片而非第一卡片，以及把原Projection顺序误当raw行顺序。现精准选择第一卡片、以初始化实际顺序断言失败回退，未改产品或放宽守卫。完整PG首次发现旧migration完整列表/权限总数预期需前向更新，待最终失败回执逐项核对。

B2第三轮UI9/9通过，新增保存后六宽度设置页与Escape焦点恢复验收。独立读代码发现新Server设置项会出现在旧Browser系统菜单，现限定仅fresh Server+显式snapshot，避免给Browser无效入口，需新精确构建重验。完整PG首轮236PASS/6FAIL，原因均为预期迁移列表未含0024、权限65应为66；只前向维护明确列表/总数，原断言保留。

最终C705构建25项UI/898root/261PG/56设置与历史升级/94基线/Source70PASS1Linux skip、全lint/类型/Server及两Authority构建均通过。AI目视发现390px共用Foundation隐藏首个action，辅料设置入口不可见；新增仅物料页移动端覆盖与按钮可见/左右顺序断言，需新精确构建/UI/门禁。业务代码未改，不无谓重跑SQL；旧通过证据保留其C705范围。

B0手机动作修复后旧页面/多余仓16项通过，B2焦点断言在Foundation约定的requestAnimationFrame恢复前抢读导致23PASS/2FAIL（含父）。实际代码明确在下一帧restoreFocus；改为最多1秒等待精确原按钮，不修改Foundation或降低焦点目标。下一轮截图写独立run后缀，保留首次回执/图片，产品仍精确B0源码。
