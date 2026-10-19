# Gate5 CI 构建来源影响记录

核实2026-10-16；main064e3afaf7d08b3cb62907d4402f97d9c292f1e5；Phase baseline c54a2234cfe7920ff4023d9cab56345bde455a7a。更新时机：该CI文件、构建元数据或测试来源约定变化。

精确路径：`.github/workflows/ainuoke-server-source.yml`。Source测试候选构建新增`ZHIXU_GIT_COMMIT: ${{ github.sha }}`，使用现有元数据入口记录实际完整提交；此前独立物料UI测试已经要求完整40位来源SHA，且本地候选一直显式提供该值。CI仅与现有验收约定一致，未改变构建方式、authority、writer、identity、orderRead或业务路由。

新增设置/物料测试步骤只消费合成fixture，不调用真实来源，不写用户Browser数据，不开启截图采集；原冻结PNG和receipt不改。页面主题、组件、布局、交互和CSS无生产文件差异，本记录不授权V2/V3重设计，也不把源码门禁称人工像素认可。结果见当前Gate5独立交付任务和精确head Hosted CI。
