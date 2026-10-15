# 四单真实隔离演示：已执行证据

核实时间：2026-10-14T04:09:24.151786+00:00。main基线064e3afaf7d08b3cb62907d4402f97d9c292f1e5；本地分支feat/ainuoke-anomaly-evidence。用户已明确确认上一轮列出的4单、全新隔离账本、127.0.0.1:62310及两轮真实刷新。不是宁波/18443/18444发布、全部558单首绑、长期调度或人工业务验收。

## 已确认运行事实

- 本机Docker Desktop Linux；项目zhixu-live-demo-20261014-r1，独立数据库zhixu_live_demo_20261014_r1与volume zhixu-live-demo-20261014-r1-data。DB不发布端口；应用仅127.0.0.1:62310。精确owner/容器ID/网络/挂载/镜像在私有manifest锁定，操作前检查；旧容器和旧23单模拟演示未变更。
- 应用代码b95dbb3e2fd16137ade810b20781a9cdbc742be1，image sha256:57087ab323136e4ee74fa631675fca488d1817df157bb07b12b49757201b2f8b；Dockerfile.server实际构建成功。运行命令node /isolated/entry.mjs serve；独立受保护只读挂载的entry与本commit脚本hash一致。必须NODE_ENV=test和ZHIXU_AINUOKE_SOURCE_READ=snapshot，编译Server/session/snapshot authority和运行构建身份一致。首次因遗漏runtime snapshot开关被守卫拒绝，发生在业务初始化前；补明确开关后只重建尚未启动的新应用容器，没有覆盖或清空数据库。
- 目标指纹2c153b2e7d2f0dedd48edced00dfb27fadfb9a80dc0b9b52ddaab016fe9ad790。初始化前空账本，建立6演示角色账号；没有修改真实账号。预览完整当前可见558合同身份索引，只读取4单颜色，全部usable，共15颜色行，含2条具名待定0数量且保留来源空白。预览hash与重新读取后的绑定hash一致，创建4个正式SalesOrder及对应source link/合同/颜色镜像。
- 执行且只执行2轮真实固定报表采集。run IDs：0c4289a4-0bbe-40c3-ac36-d451d434432e、4516dfea-d45b-45eb-afdd-ffa5de8cd002。最新4份物料快照，共161来源行、147需求明细；4单均ready并有采购/入库/出运/出库。两轮保存历史，未生成报价/排单或回写艾诺科。没有scheduler进程；默认来源有效期30分钟，过期诚实提示。
- 已有人工确认与新鲜来源证据完全匹配2项：一项限定标签只/个1:1、一项工厂采购责任。仅为此sourceKey、account指纹与新订单UUID的受信任读取注入；来源原始单位/数量、两个有效采购事件保持，工厂自购不伪造采购/到料。

## 页面和权限验收（工程）

6演示角色共24次订单/24次物料读取通过；未登录401，六角色退出后旧session401。独立headless Chromium检查订单列表1440/390、四单正式详情、两单P6物料表，共8个页面场景；列表有数量0/单位为空标签，P6四流列、人工确认、工厂采购提示存在，0横向溢出、0Runtime exception；截图已目视，保存在私有目录，未提交真实客户或合同信息。

代表三行118/356/6个采购身份按既有已确认编码核对；356两条来源仍归并为一采购事件。标签两张不同采购单各一独立事件保留。发现历史口头理论用量115.50与当前接口TotalNum=116不一致：10月13日定向原包同样为116，本次实际采购118。没有证据说明是本次上游变化或织序取整；织序按接口原值展示，不覆盖为115.50，不判理论/实际不等即冲突。后续由IT核实界面理论值与报表TotalNum口径，历史用户确认保留。

负向实机验证3项：第三次capture返回authorized_capture_limit_reached、错误目标指纹返回isolated_target_mismatch、重复initialize返回isolated_already_initialized。负向采集输入使用指向本机无服务端口的合成凭据配置；在collector前拒绝，没有第三次真实来源读取。终态仍4单/2run。

## 私有与公开证据分界

私有manifest SHA256 56d130f7aabf85e8b28e9083b3b5ebcfc1e361d0ec2e277ed5696cb69b76d214；私有readback SHA256 447d2d6a1808ad14b81269f546702cd4d06486d9620022b3fb826e7ad135aaea。位于当前工作树outputs/isolated-private-*，Windows ACL仅当前用户/SYSTEM，Git与Docker构建忽略。该目录含manifest、精确四单选择、preview/bind/capture回执、原始readback、两项确认包、HTTP/浏览器/负向验证、截图及登录说明。源凭据仍从用户原本机文件读取，通过stdin给短命采集器，不进入聊天/argv/env或镜像。公开文档只记录脱敏计数/技术身份。

## 状态与操作边界

隔离目标首绑和两轮真实Source持久化已完成；现有页面已连真实快照。长期自动刷新未激活，人工业务验收未完成。4单范围之外的取消、退库、完整单位治理、原Excel配置导入和独立报价转单分支不是此次已完成内容。用户访问入口与新演示密码在本机受保护登录说明，不复用真实账号密码。

后续再次采集必须显式授权新轮次/频率并更新控制范围；不要改快照fetchedAt绕过过期，不自动重跑第三轮。回退为只停本任务owner/ID匹配的app/pg，保留volume/回执；不要docker compose down -v，不清旧库，不改变共享Docker/网络/认证配置。

本机运行成功不等于GitHub送达/合并。网络协议仍NETWORK_DEGRADED，未重复push、未创建新PR或运行新远端CI。PR108未合并，当前运行候选依赖本地明确提交。更新时机：采集、授权、运行资源、代码/镜像、来源异常或用户业务验收变化。
