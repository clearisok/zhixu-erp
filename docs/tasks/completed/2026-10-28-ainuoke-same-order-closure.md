# 同一艾诺科订单的跨域闭环回归

2026-10-28；branch `feat/closing-support-interfaces`；本片baseline `c51bd1b1571a5e19d27821fdf879269944b33365` clean，核实main仍为本地已有的 `6479a713e2b80228f008049519ebbd50d10601a8`，本片未刷新远端。最终commit从Git HEAD读取。前片上传实际失败、远端仍c9/PR131草稿的事实不改变；本片不重复上传或触发CI，不合并、部署或操作真实Source。

## 增量与实际范围

新增 `server/integration/ainuoke-order-closed-loop.integration.test.ts`，仅复用原正式服务和现有合成fixture；在package.json现有 `test:ainuoke-continuous` 末尾注册，不另建工作流或增加push触发。旧9/9持久恢复保留，它证明多个非空模块的备份恢复；新增回归补同一合同/SO贯穿模块的关联与隔离，不把二者当成同一验收。

主SO由可信Discovery/颜色首绑产生，第二合同只满足6086941固定双目标及交叉隔离正控；两合同都为生成的合成记录。Quote由原fixture显式建立，正式采用后才有商业版本。调用所有采集服务时明确注入synthetic callback，无真实worker启动、凭据/旧私密报告读取或上游请求。数据库由现有startDisposablePostgres创建，独立随机名/tmpfs，测试结束只释放该测试自有容器。

七项子验收（加父测试计8）：

1. 首绑重试返回相同UUID/SO，不重复建Quote，合同交期月份默认2027-02。
2. 明确采用报价的USD工价；手工交期改到4月不静默调关账；同色排单100件，手工完成20件。第二SO明确移至3月，不混入主单月份。
3. 同一SO四条物料流均非空；采集不改商业头/明细/快照、身份、手工交期、生产或月份/财务记录。
4. 6086941对应原双合同，两个独立快照；申请仍bankPaymentStatus=not_inferred，不推断实付或自动创建关账。
5. 6086979的7件匹配主单稳定颜色ID；生产仍20件、月份仍100件，不拿物料出运代替成衣出货，也不把成衣出货当生产完成。
6. 显式采用月份财务后才形成100件、成衣销售10000 CNY和经销工价250 USD；销售按113/(1+13%)计算，不换汇。显式确认/锁定，快照非空且逐项属于主单和该颜色。
7. 后继可信合同量120件，仍原UUID/SO和颜色ID；原商业及执行字节、手工交期、100件月份和锁定快照保持，来源差异提示待复核。物料失败显示source_failed，单独成功重采恢复ready；不重建SO或覆盖冻结金额。

## 实际验证与限制

- 首轮类型发现测试误用不存在的summary.workUsd；根据现有read-service改为distributionLaborUsd，不改产品字段。
- 首轮新测试8/8，8546.242ms。随后补商业heads/lines/source snapshots、月财务link和period版本的完整保护正控，8/8，8751.8288ms；对应 `outputs/approved-support-flow-20261028/same-order-closure-final.log`。复审指出“预览120+sourceChanged”仍不能证明合同总量120已落库，补直接断言订单总量120、生产读模型总量/原稳定颜色量均120后，最终 **8/8，8619.3595ms**，0失败/取消/跳过；`same-order-closure-reviewed.log`，均为ignored本机证据，不覆盖前次结果。
- 最终类型、该文件eslint、diff通过；文档收口后按实际完整HEAD运行精确发布守卫。其他产品测试/浏览器/构建不重复。package只增加测试路径，应用源码、SQL、锁文件、前端构建配置、UI、权限和业务规则未改，沿用a198产品与c9完整182发布结果，不冒称新跑完整工程套件。
- 已有独立只读审阅者确认上述P2关闭，最终本片无剩余P1/P2；只静态复审，未运行测试或访问来源/数据库。

同片额外Linux入口观察：缓存image `sha256:90e36de7c3d61ca137b2d5a4227e848b83ed57579bd146ce25501dbc6fe35f4f`，单次无网络/无挂载/只读/非root临时容器，help可用而payment/garment compiled receipt被clean源码守卫拒绝；Node22.23.3/Python3.14.10，Git/tsx不可用。没有DB或Source调用、现有容器变更；这只是确定操作者运行方式，不是实际Linux采集成功。发布采用干净同SHA源码目录与锁定依赖的原CLI，不另建collector或绕过守卫。

真实首绑/来源激活/有限续刷、Hosted新检查、精确main合并和宁波新目标仍未发生。D105/D147、冻结/货币/期间税率规则及旧资产保护全部保留；就绪提醒不能替代部署授权。
