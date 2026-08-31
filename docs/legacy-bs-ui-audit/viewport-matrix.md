# 工作环境视口矩阵

## 证据等级与限制

本轮使用 `http://127.0.0.1:3001` 的真实 DEV 页面、真实 DOM 和现有浏览器数据进行只读审计。浏览器控制环境可以精确设置 CSS viewport，但不能切换 Windows 显示缩放、Chrome/Safari 浏览器缩放、触摸指针、iOS Safe Area 或真实软件键盘。

因此：

- 下表的 `innerWidth`、`innerHeight`、`visualViewport` 与页面滚动宽度是页面运行时实测值。
- `1920-win100`、`1920-win125`、`browser125`、`browser150` 是请求档位下的**模拟 CSS viewport 测试标签**，不是对真实 Windows/Chrome 缩放状态的冒充。
- `outerWidth`、`outerHeight` 属于宿主浏览器窗口；启用 viewport override 后会在 `1162×750` 与 `2050×1234` 间变化，不能用于反推 Windows 缩放。
- 保存 PNG 受内置浏览器表面上限影响：请求 `1920×1080` 时实际图片为 `1673×1080`，请求 `1536×864` 时部分图片为 `1512×864`。DOM 仍报告请求的 CSS viewport；这组图片适合布局审计，但不等同于实体显示器像素级验收。
- `devicePixelRatio` 为 `1`（个别浮点读数为 `1.0000000149`），不是 Windows 125% 或 iPhone DPR。

## 运行元数据

| 环境标签 | CSS viewport（实测 `inner`） | `visualViewport` | DPR | 宿主 `outer` 代表读数 | 截图数 | 文档横向溢出 | 主要内部横向滚动 |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| 1920 / Win 100 / Browser 100 · 全屏 | 1920×1080 | 1920×1080 / scale 1 | 1 | 1162×750 | 10 | 0 页 | 订单表仍约多 346px |
| 1920 / Win 100 / Browser 100 · 半屏 | 960×1080 | 960×1080 / scale 1 | 1 | 1162×750 | 10 | 0 页 | 报价约 396px；订单约 1047px |
| 1920 / Win 125 / Browser 100 · 全屏 | 1536×864 | 1536×864 / scale 1 | 1 | 1162×750 | 14 | 0 页 | 订单约 611px |
| 1920 / Win 125 / Browser 100 · 半屏 | 768×864 | 768×864 / scale 1 | 1 | 1162×750 | 14 | 0 页 | 报价约 588px；订单约 1239px；权限约 61px |
| 1920 / Win 125 / Browser 125 · 全屏 | 1280×720 | 1280×720 / scale 1 | 1 | 1162×750 | 10 | 0 页 | 报价约 76px；订单约 727px |
| 1920 / Win 125 / Browser 125 · 半屏 | 768×720 | 768×720 / scale 1 | 1 | 2050×1234 | 10 | 0 页 | 报价约 588px；订单约 1239px；权限约 61px |
| 1920 / Win 125 / Browser 150 · 全屏 | 1024×640 | 1024×640 / scale 1 | 1 | 2050×1234 | 10 | 0 页 | 报价约 332px；订单约 983px |
| 1920 / Win 125 / Browser 150 · 半屏 | 640×640 | 640×640 / scale 1 | 1 | 2050×1234 | 10 | 0 页 | 报价约 731px；权限约 189px；订单切为卡片 |
| 高分辨率 · 全屏 | 1536×864 | 1536×864 / scale 1 | 1 | 2050×1234 | 8 | 0 页 | 订单约 611px |
| 高分辨率 · 半屏 | 960×864 | 960×864 / scale 1 | 1 | 2050×1234 | 8 | 0 页 | 报价约 396px；订单约 1047px |

“文档横向溢出为 0”只说明 `documentElement.scrollWidth === clientWidth`。报价、订单、权限等页面仍有卡片或表格内部横向滚动，不能理解为所有信息都已适配。

## 截图目录与代表证据

- 1920 / Win 100 / Browser 100：[报价中心全屏](screenshots-working-env/1920-win100-browser100/fullscreen/quote-center.png)、[订单中心全屏](screenshots-working-env/1920-win100-browser100/fullscreen/order-center.png)、[订单详情半屏](screenshots-working-env/1920-win100-browser100/halfscreen/order-detail.png)
- 1920 / Win 125 / Browser 100：[报价详情全屏](screenshots-working-env/1920-win125-browser100/fullscreen/quote-detail.png)、[报价成本状态](screenshots-working-env/1920-win125-browser100/fullscreen/quote-detail-costs.png)、[生产组队列](screenshots-working-env/1920-win125-browser100/fullscreen/production-scheduling-group.png)、[半屏权限详情](screenshots-working-env/1920-win125-browser100/halfscreen/user-permissions-detail.png)
- 1920 / Win 125 / Browser 125：[报价中心全屏](screenshots-working-env/1920-win125-browser125/fullscreen/quote-center.png)、[报价中心半屏](screenshots-working-env/1920-win125-browser125/halfscreen/quote-center.png)
- 1920 / Win 125 / Browser 150：[订单中心全屏](screenshots-working-env/1920-win125-browser150/fullscreen/order-center.png)、[订单中心半屏](screenshots-working-env/1920-win125-browser150/halfscreen/order-center.png)
- 高分辨率：[报价详情全屏](screenshots-working-env/high-resolution/fullscreen/quote-detail.png)、[生产排单半屏](screenshots-working-env/high-resolution/halfscreen/production-scheduling.png)

## 截图数量

| 目录 | 数量 |
| --- | ---: |
| `1920-win100-browser100/fullscreen` | 10 |
| `1920-win100-browser100/halfscreen` | 10 |
| `1920-win125-browser100/fullscreen` | 14 |
| `1920-win125-browser100/halfscreen` | 14 |
| `1920-win125-browser125/fullscreen` | 10 |
| `1920-win125-browser125/halfscreen` | 10 |
| `1920-win125-browser150/fullscreen` | 10 |
| `1920-win125-browser150/halfscreen` | 10 |
| `high-resolution/fullscreen` | 8 |
| `high-resolution/halfscreen` | 8 |
| 合计 | 104 |

## 仍需实体环境补验

1. Windows 1920×1080、系统缩放 100%、Chrome 100%，最大化与左右半屏。
2. Windows 1920×1080、系统缩放 125%、Chrome 100%、125%、150%，最大化与左右半屏。
3. 验证真实浏览器 chrome、任务栏、Windows 半屏吸附后产生的 `inner/outer/DPR`，并替换本文件中的模拟标签。
4. iPhone Safari 的 DPR、粗指针、Safe Area、地址栏展开/收起和系统键盘；详见 [mobile-audit.md](mobile-audit.md)。
