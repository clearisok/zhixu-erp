# Gate8G2c：全年同范围两项产值读取

2026-10-27；branch `feat/order-closing-month-plan`，clean输入81879ad66d5cb92088852ecfc0f2e48e3d027c13。沿用main869ee84dd0b31de6161011e4aa560678b244a64d的本地完整已核实对象，不fetch/远端写；Git原STOP未定。用户具体UI已批准，此片先补其年度后端依赖，不重复询问。

GET /api/v1/closing/year一次快照返回12月/全年两项、同范围明细和待分月。开放月是当前已采用价参考，冻结月是原manifest；无价格写入、成本重算、换汇或自动认定。执行范围/实际生产状态/search且条件同时过滤合计和明细，分页不变汇总；缺税/价/有效USD工价的总额为null并显示可见已知小计。[契约](../../features/SERVER_CLOSING_ANNUAL_READ.md)。

定向10/10后追加更正/冻结Source/不可表示量用例，年度+财务23/23、修后年度11/11、既有月份37/37通过，覆盖集合重叠不相加。首轮类型的PriceView bucket联合不匹配已修，前次规范副本通过仅属于误报提示修复前代码；最后完整规范副本/源码绑定、lint和精确守卫以本机outputs/closing-annual-read-20261027及冻结工程为准。没有重复跑G2b163/整仓811/完整144或Hosted。

只读复审指出冻结记录缺生产更正提示、随后刚锁定误报后续更正，两处均修并补confirmed/locked正反断言，金额保持；最终只读复审0P1/P2。frozen-only不依赖当前Source/商业资格，新unsupported量即使默认月冻结仍保留pending。初始失败/范围受限结果保留。

尚无年度客户端、月份命令HTTP/恢复协议、正式UI或像素/人工业务验收；500订单压测、旧入口整体退役、Source异常更正和新镜像恢复仍后续。0真实Source/现有账号业务库/远端/Hosted/合并部署/切换退役；68能力不变，Goal active。

最后规范副本3132输入，根类型35229ms、Server构建12594ms通过，8个本片TS/package输入实际字节一致；7文件lint通过，复审修复后两文件再次lint通过。初始类型错误和复审前结果保留，没有清理旧ignored冲突样本或更改tsconfig/依赖。源码S bdfc531ba5a334e6854903e85a5ec966d653e2ad；[冻结工程](../completed/2026-10-27-closing-annual-read-engineering.md)及本机final.json记录分源验证和元数据HEAD守卫，未取得前不预报通过。
