"use client";

import { useMemo, useState } from "react";

type CostLine = {
  id: number;
  code: string;
  name: string;
  spec: string;
  usage: number;
  unit: string;
  loss: number;
  price: number;
  tone: "ink" | "sand" | "blue" | "rose";
};

const initialMaterials: CostLine[] = [
  { id: 1, code: "M-1024", name: "精梳全棉单面布", spec: "180g · 32S · 本白", usage: 0.32, unit: "kg", loss: 5, price: 42.8, tone: "ink" },
  { id: 2, code: "R-0218", name: "1×1 罗纹", spec: "260g · 同缸色", usage: 0.048, unit: "kg", loss: 8, price: 46.5, tone: "sand" },
  { id: 3, code: "A-0086", name: "主唛 / 洗水唛", spec: "缎面印字 · 2件套", usage: 1, unit: "套", loss: 2, price: 0.72, tone: "blue" },
  { id: 4, code: "P-0031", name: "透明自封袋", spec: "28×38cm · 5丝", usage: 1, unit: "个", loss: 1, price: 0.34, tone: "rose" },
];

const processing = [
  { name: "裁剪", detail: "自动铺布 + 电脑裁床", price: 1.65 },
  { name: "车缝", detail: "22道工序 · 标准工时 9.6 分钟", price: 8.8 },
  { name: "整烫", detail: "成衣整烫 + 尺寸复核", price: 1.15 },
  { name: "质检包装", detail: "AQL 2.5 · 单件入袋", price: 1.28 },
];

const nav = ["工作台", "报价管理", "订单管理", "样衣管理", "采购管理", "生产管理", "库存管理", "财务管理"];

function money(value: number, currency: string) {
  const converted = currency === "USD" ? value / 7.2 : value;
  return `${currency === "USD" ? "$" : "¥"}${converted.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Home() {
  const [materials, setMaterials] = useState(initialMaterials);
  const [quantity, setQuantity] = useState(3000);
  const [margin, setMargin] = useState(22.5);
  const [currency, setCurrency] = useState("RMB");
  const [activeTab, setActiveTab] = useState("成本核算");
  const [toast, setToast] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [client, setClient] = useState("上海叙白服饰有限公司");

  const materialCost = useMemo(
    () => materials.reduce((sum, item) => sum + item.usage * (1 + item.loss / 100) * item.price, 0),
    [materials]
  );
  const processingCost = processing.reduce((sum, item) => sum + item.price, 0);
  const otherCost = 1.68 + (materialCost + processingCost) * 0.035;
  const factoryCost = materialCost + processingCost + otherCost;
  const suggestedPrice = factoryCost / (1 - margin / 100);
  const total = suggestedPrice * quantity;
  const grossProfit = suggestedPrice - factoryCost;

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  function updateMaterial(id: number, key: "usage" | "loss" | "price", value: number) {
    setMaterials((rows) => rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }

  function addMaterial() {
    const id = Math.max(...materials.map((row) => row.id), 0) + 1;
    setMaterials((rows) => [...rows, { id, code: `N-${String(id).padStart(4, "0")}`, name: "新增辅料", spec: "待填写规格", usage: 1, unit: "个", loss: 3, price: 0, tone: "blue" }]);
  }

  return (
    <main className="erp-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">纫</span>
          <div><strong>纫造 ERP</strong><small>APPAREL CLOUD</small></div>
        </div>
        <div className="company-switch">
          <span className="company-avatar">苏</span>
          <div><small>当前组织</small><strong>苏州纫造服饰</strong></div>
          <b>⌄</b>
        </div>
        <nav aria-label="主导航">
          <p>业务中心</p>
          {nav.map((item, index) => (
            <button key={item} className={item === "报价管理" ? "active" : ""} onClick={() => item === "报价管理" ? undefined : notify(`${item}模块已准备就绪`)}>
              <span className="nav-symbol">{["⌂", "¥", "▣", "◇", "⌁", "▦", "□", "◎"][index]}</span>
              {item}
              {item === "报价管理" && <em>8</em>}
            </button>
          ))}
          <p>系统设置</p>
          <button onClick={() => notify("基础资料已同步")}><span className="nav-symbol">⚙</span>基础资料</button>
          <button onClick={() => notify("帮助中心已打开")}><span className="nav-symbol">?</span>帮助中心</button>
        </nav>
        <div className="sidebar-footer">
          <span className="user-avatar">林</span>
          <div><strong>林青禾</strong><small>高级业务经理</small></div>
          <b>•••</b>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>报价管理</span><b>/</b><strong>新建报价单</strong></div>
          <div className="top-actions">
            <label className="search-box"><span>⌕</span><input aria-label="全局搜索" placeholder="搜索款号、客户或报价单" /></label>
            <button className="round-button" aria-label="消息" onClick={() => notify("暂无新消息")}>♢<i /></button>
            <button className="round-button" aria-label="更多操作" onClick={() => notify("更多操作")}>•••</button>
          </div>
        </header>

        <div className="page-wrap">
          <header className="page-header">
            <div>
              <div className="title-line"><h1>新建成衣报价</h1><span className="draft-chip">草稿</span></div>
              <p>QT-2026-0814-007 <i /> 最后保存于 2 分钟前</p>
            </div>
            <div className="header-actions">
              <button className="ghost-button" onClick={() => notify("已保存草稿")}>保存草稿</button>
              <button className="primary-button" onClick={() => notify("报价单已生成，可发送给客户")}>生成报价单 <span>→</span></button>
            </div>
          </header>

          <div className="stepper" aria-label="报价步骤">
            <div className="step done"><span>✓</span><div><small>STEP 01</small><strong>款式信息</strong></div></div>
            <i />
            <div className="step current"><span>2</span><div><small>STEP 02</small><strong>成本与报价</strong></div></div>
            <i />
            <div className="step"><span>3</span><div><small>STEP 03</small><strong>条款与预览</strong></div></div>
          </div>

          <div className="content-grid">
            <div className="main-column">
              <section className="style-card">
                <div className="garment-thumb" aria-label="T恤款式示意图"><span /></div>
                <div className="style-info">
                  <span className="category">圆领 T 恤 · 针织</span>
                  <h2>重磅精梳棉宽松短袖 T 恤</h2>
                  <div className="style-meta"><span>款号</span><strong>TS-2608-014</strong><i /><span>季节</span><strong>2026 秋季</strong><i /><span>开发类型</span><strong>来样开发</strong></div>
                </div>
                <button className="text-button" onClick={() => notify("已进入款式资料")}>查看款式资料 ↗</button>
              </section>

              <section className="form-card basics-card">
                <div className="section-head">
                  <div><span className="section-index">01</span><div><h3>报价基础</h3><p>设置客户、贸易条款与数量基准</p></div></div>
                  <button className="collapse-button" aria-label="折叠基础信息">⌃</button>
                </div>
                <div className="form-grid">
                  <label><span>客户名称 <b>*</b></span><div className="select-like"><input value={client} onChange={(e) => setClient(e.target.value)} /><i>⌄</i></div></label>
                  <label><span>报价币种 <b>*</b></span><div className="segmented"><button className={currency === "RMB" ? "selected" : ""} onClick={() => setCurrency("RMB")}>CNY ¥</button><button className={currency === "USD" ? "selected" : ""} onClick={() => setCurrency("USD")}>USD $</button></div></label>
                  <label><span>贸易条款</span><div className="select-like"><input value="EXW 工厂交货" readOnly /><i>⌄</i></div></label>
                  <label><span>报价有效期</span><div className="select-like"><input value="2026-08-28" readOnly /><i>▣</i></div></label>
                  <label className="wide"><span>报价数量 <b>*</b></span><div className="quantity-field"><div className="quantity-presets">{[1000, 3000, 5000, 10000].map((qty) => <button key={qty} className={quantity === qty ? "selected" : ""} onClick={() => setQuantity(qty)}>{qty.toLocaleString()} 件</button>)}</div><div className="custom-qty"><input type="number" value={quantity} min="1" onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} /><span>件</span></div></div></label>
                </div>
              </section>

              <section className="form-card cost-card" id="cost-section">
                <div className="section-head">
                  <div><span className="section-index">02</span><div><h3>成本核算</h3><p>按单件用量核算，金额随参数实时更新</p></div></div>
                  <div className="cost-head-actions"><span>成本模板：<strong>针织 T 恤 / 标准</strong></span><button onClick={() => notify("已切换成本模板")}>切换模板</button></div>
                </div>
                <div className="cost-tabs">{["物料成本", "加工成本", "其他费用"].map((tab, i) => <button key={tab} className={i === 0 ? "selected" : ""}><span>{String(i + 1).padStart(2, "0")}</span>{tab}<strong>{i === 0 ? money(materialCost, currency) : i === 1 ? money(processingCost, currency) : money(otherCost, currency)}</strong></button>)}</div>
                <div className="table-scroll">
                  <table className="cost-table">
                    <thead><tr><th>物料</th><th>规格 / 说明</th><th>单件用量</th><th>损耗率</th><th>采购单价</th><th>单件金额</th><th /></tr></thead>
                    <tbody>{materials.map((item) => {
                      const amount = item.usage * (1 + item.loss / 100) * item.price;
                      return <tr key={item.id}>
                        <td><div className="material-name"><span className={`swatch ${item.tone}`} /><div><strong>{item.name}</strong><small>{item.code}</small></div></div></td>
                        <td><span className="spec-text">{item.spec}</span></td>
                        <td><div className="number-field"><input aria-label={`${item.name}单件用量`} type="number" step="0.001" value={item.usage} onChange={(e) => updateMaterial(item.id, "usage", Number(e.target.value))} /><span>{item.unit}</span></div></td>
                        <td><div className="number-field compact"><input aria-label={`${item.name}损耗率`} type="number" step="1" value={item.loss} onChange={(e) => updateMaterial(item.id, "loss", Number(e.target.value))} /><span>%</span></div></td>
                        <td><div className="number-field"><span>{currency === "USD" ? "$" : "¥"}</span><input aria-label={`${item.name}采购单价`} type="number" step="0.01" value={item.price} onChange={(e) => updateMaterial(item.id, "price", Number(e.target.value))} /></div></td>
                        <td><strong className="amount">{money(amount, currency)}</strong></td>
                        <td><button className="delete-line" aria-label={`删除${item.name}`} onClick={() => setMaterials((rows) => rows.filter((row) => row.id !== item.id))}>×</button></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
                <div className="table-footer"><button className="add-line" onClick={addMaterial}>＋ 添加物料</button><div><span>物料成本小计</span><strong>{money(materialCost, currency)}</strong></div></div>

                <button className="advanced-toggle" onClick={() => setAdvancedOpen(!advancedOpen)}><span>{advancedOpen ? "−" : "+"}</span>{advancedOpen ? "收起加工与其他费用" : "展开加工与其他费用"}<small>{money(processingCost + otherCost, currency)} / 件</small></button>
                {advancedOpen && <div className="advanced-costs">
                  {processing.map((item) => <div key={item.name}><span><strong>{item.name}</strong><small>{item.detail}</small></span><b>{money(item.price, currency)}</b></div>)}
                  <div><span><strong>其他费用</strong><small>包装、运费及 3.5% 管理分摊</small></span><b>{money(otherCost, currency)}</b></div>
                </div>}
              </section>

              <section className="form-card note-card">
                <div className="section-head compact-head"><div><span className="section-index">03</span><div><h3>报价备注</h3><p>备注将展示在客户报价单中</p></div></div></div>
                <textarea defaultValue="以上报价基于 3,000 件起订量，含常规包装，不含税及国内运费。大货颜色以确认色卡为准，尺寸误差按行业标准执行。" />
              </section>
            </div>

            <aside className="summary-column">
              <section className="summary-card">
                <div className="summary-title"><div><span className="live-dot" /><h3>报价汇总</h3></div><small>实时计算</small></div>
                <div className="quote-hero">
                  <span>建议含利润单价</span>
                  <strong>{money(suggestedPrice, currency)}</strong>
                  <small>/ 件 · {quantity.toLocaleString()} 件起订</small>
                </div>
                <div className="summary-list">
                  <div><span>物料成本</span><strong>{money(materialCost, currency)}</strong></div>
                  <div><span>加工成本</span><strong>{money(processingCost, currency)}</strong></div>
                  <div><span>其他费用</span><strong>{money(otherCost, currency)}</strong></div>
                  <div className="factory-row"><span>工厂成本</span><strong>{money(factoryCost, currency)}</strong></div>
                </div>
                <div className="margin-block">
                  <div><span>目标毛利率</span><strong>{margin.toFixed(1)}%</strong></div>
                  <input aria-label="目标毛利率" type="range" min="5" max="45" step="0.5" value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
                  <div className="range-marks"><span>5%</span><span>25%</span><span>45%</span></div>
                </div>
                <div className="profit-strip"><div><span>单件毛利</span><strong>{money(grossProfit, currency)}</strong></div><i /><div><span>成本率</span><strong>{(factoryCost / suggestedPrice * 100).toFixed(1)}%</strong></div></div>
                <div className="grand-total"><span>预计报价总额</span><strong>{money(total, currency)}</strong><small>{currency === "USD" ? "参考汇率：1 USD = 7.20 CNY" : `含 ${quantity.toLocaleString()} 件 · 未税`}</small></div>
                <button className="detail-button" onClick={() => document.getElementById("cost-section")?.scrollIntoView({ behavior: "smooth" })}>查看成本明细 <span>↗</span></button>
              </section>

              <section className="history-card">
                <div className="history-head"><h3>历史报价参考</h3><button onClick={() => notify("历史报价列表已打开")}>查看全部</button></div>
                <div className="history-item"><span>TS-2511-032</span><strong>{money(41.5, currency)} / 件</strong><small>同款面料 · 5,000 件</small><em>已成交</em></div>
                <div className="history-item"><span>TS-2509-018</span><strong>{money(43.2, currency)} / 件</strong><small>相似工艺 · 2,000 件</small><em className="gray">已过期</em></div>
              </section>

              <div className="hint-card"><span>i</span><p><strong>成本提示</strong>当前面料采购价较近 30 日均价低 3.2%，建议锁定价格有效期。</p></div>
            </aside>
          </div>
        </div>
      </section>
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
