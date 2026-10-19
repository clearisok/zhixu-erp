# 6086941隔离存储与只读接口工程证据

核实2026-10-15；GitHub main 064e3afaf7d08b3cb62907d4402f97d9c292f1e5。此报告随源码checkpoint冻结，manifest提供精确recordedAtSha；后续结果前向记入任务，不覆盖此文件。

已确认工程：0025从非空0024升级只新增三表、函数和防护，不回填目标/观察/账号或授权；正常启动面对pending migration拒绝。独立目标逐SO默认关闭，Session runtime读开关默认关闭；内部prepare/publish及只读GET通过实际一次性PostgreSQL、合成session和七角色验证。无真实凭据/报表/数据库/现有演示访问。

19/19新增定向验证：默认关闭/未启用/未采集，HTTP无写入/查询选择/免登录绕过，127行实际两页JSONB重建及重启，精确小数/独立数量/负调整/未知值，幂等并发和不同捕获CAS，异步输入固定，缺页/混单/变化/伪金额字段，采集不得早于范围核对，最早页到期隐藏，账号/启用版本变化，fresh DB授权/撤权，SQL不可改删/跳代/NULL元数据/错误owner，损坏投影不因hash或重试通过，观测不能回退，加工不适用、历史别名拒绝、归一清单含全部新增引用且无金额明文。

最终Source/纯模型/探测/归一/有效归属回归：219项中218通过、1跳过、0失败（payment-storage-final-related.log）。跳过是原Linux CLI检查在Windows不适用；实际Python固定catalog/loopback测试通过。此后只扩充同一有效SO新归属代际及纠正成历史别名的负向断言，新19项再次全部通过（payment-storage-attribution-final.log），运行代码未变。类型/Server编译及完整源码lint通过。root与发布基线最终结果在本阶段任务后续登记，不冒称此时已跑完。

发现与修复：第一轮upsert会先触发INSERT代际检查，第二代误被阻断；改为首次INSERT和后续带generation条件的UPDATE，不放宽SQL。迁移runner返回文件名，测试按实际契约修正。归一全量外键盘点须分类新财务引用，避免将新表当未知对象；不移动数据，也不把来源观察等同财务冻结。存储JSONB不能仅凭content_hash信任；读取及精确重试重建原输入核验。

明确边界：只实现观察型存储/API，不提供完整财务台账、银行付款事实、求和、稳定事件去重、默认币种/换汇或正式齐套修改；200行/两页仍是试点上限。内部范围对象不是客户端许可，实际发布必须来自后续受控采集器；真实过滤还未验证、无新读取授权，不能凭启用标记或verification hash自称已获人类授权。财务侧栏/采集器/授权目标激活尚待后续。实际迁移/真实写入/Source绑定激活/部署均未执行。

日志为本机Git忽略outputs/payment-storage-{first-test,second-test,third-test,related-pg,final-targeted,typecheck-final2,server-build-final2,full-lint}.log。公开提交仅合成数据和统计，未写真实合同号、物料业务行或凭据。
