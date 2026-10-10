import assert from "node:assert/strict";
import { createQuoteMasterService } from "../quote-masters/service.ts";
import { permissionsForUser } from "../auth/permissions.ts";

export async function runTwoStepCreation({ t, pool, requests, navigate, hasText, labelInput, click, evaluate, command, sessionId, sleep, until, isolated, loginAs }) {
  await loginAs("admin");
  const user = (await pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic-ui-admin'")).rows[0];
  const actor = { internalUserId: user.id, userId: user.public_id, userName: "Synthetic UI administrator", username: "synthetic-ui-admin", permissions: await permissionsForUser(pool, user.id) };
  const master = createQuoteMasterService(pool);
  const defaults = { defaultUsdCnyRate: "7.25", defaultOtherCost: null, defaultTrims: [] };
  const brand = await master.createBrand(actor, { name: "Two-step synthetic Brand", status: "active", defaults });
  const person = await master.createSalesperson(actor, { name: "Two-step synthetic Person", brandId: brand.id, status: "active", defaults });
  const presetA = await master.createPreset(actor, { name: "Two-step synthetic first", country: "Cambodia", laborCurrency: "USD", markupRate: "0", includeFreight: true, freightName: "Synthetic freight", freightAmount: "0", status: "active" });
  const presetB = await master.createPreset(actor, { name: "Two-step synthetic second", country: "Cambodia", laborCurrency: "CNY", markupRate: "0.15", includeFreight: false, freightName: "", freightAmount: null, status: "active" });
  const count = async () => Number((await pool.query("SELECT count(*) FROM quote_center_quotes")).rows[0].count);
  const select = async (label, value) => evaluate(`(()=>{const s=[...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('select');if(!s)throw Error('Missing select '+${JSON.stringify(label)});s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const start = async (type = "processing", presetId = presetA.id) => {
    await navigate("/quote-center/new"); await until(async () => await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='下一步'&&!n.disabled)"), "wizard options");
    await select("报价类型", type); await labelInput("制作国家", "Cambodia");
    assert.equal(await evaluate("[...document.querySelectorAll('label.qc-form-item')].find(n=>n.querySelector('span')?.textContent==='制作预设').querySelector('select').value"), "", "multiple active presets are not automatically chosen");
    if (presetId) await select("制作预设", presetId);
    await click("下一步"); await select("品牌", brand.id); await select("客户业务员", person.id);
    await labelInput("款号", "SYNTHETIC-TWO-STEP-UI"); await labelInput("款式名称", "Synthetic two-step UI"); await labelInput("数量", "0"); await labelInput("成衣交期", "2028-02-29"); await labelInput("备注", "Synthetic retained note");
    await click("核对制作参数");
    await until(async () => await evaluate("Boolean(document.querySelector('[data-creation-preview]'))"), "completed creation preview");
    await hasText(presetId ? "制作参数已配置" : "制作参数待完善");
  };
  await t.test("actual two-step back/cancel and incomplete preview never create Quote or allocate number", async () => {
    const before = await count(), sequence = (await pool.query("SELECT last_value::text,is_called FROM quote_center_quote_number_seq")).rows[0];
    await start("processing", null); await click("上一步"); await hasText("制作国家"); await click("下一步");
    assert.ok(await evaluate("[...document.querySelectorAll('input')].some(n=>n.value==='SYNTHETIC-TWO-STEP-UI')"));
    await click("取消"); await hasText("本页"); assert.equal(await count(), before); assert.deepEqual((await pool.query("SELECT last_value::text,is_called FROM quote_center_quote_number_seq")).rows[0], sequence); await isolated();
  });
  for (const [type, presetId] of [["processing", presetA.id], ["distribution", presetB.id]]) await t.test(`actual two-step ${type}: choose matching preset, final atomic snapshot and material visibility`, async () => {
    const before = await count(), startRequests = requests.length; await start(type, presetId);
    assert.equal(await count(), before);
    await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='创建报价'&&!n.disabled);b.click();b.click();})()");
    await until(async () => await evaluate("location.pathname==='/quote-center/detail'"), "atomic detail"); await hasText("Server 报价 · v1");
    const id = await evaluate("new URLSearchParams(location.search).get('id')");
    const read = async () => evaluate(`fetch('/api/v1/quotes/${id}').then(r=>r.json()).then(b=>b.quote)`);
    const saved = await read(), revision = saved.quote.revisions[0], pv = revision.priceVersions[0];
    assert.equal(await count(), before + 1); assert.equal(revision.baseInfo.quoteType, type); assert.equal(revision.baseInfo.brandId, brand.id); assert.equal(revision.baseInfo.salespersonId, person.id); assert.equal(revision.baseInfo.garmentLeadDate, "2028-02-29"); assert.equal(pv.quantity, "0"); assert.equal(pv.pricingParameters.manufacturingPresetId, presetId);
    assert.equal(requests.slice(startRequests).filter(r=>r.method==='POST'&&r.path.endsWith('/creation-workflows')).length, 1);
    assert.equal(requests.slice(startRequests).filter(r=>r.method==='PUT'||r.method==='POST'&&r.path==='/api/v1/quotes').length, 0);
    if (type === "processing") {
      assert.equal(await evaluate("Boolean(document.querySelector('#quote-section-fabrics'))"), false);
      await click("查看内部面辅料"); await click("＋ 增加面料");
      await evaluate("(()=>{const n=document.querySelector('#quote-section-fabrics input[aria-label$=\"-名称\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'Synthetic hidden retained fabric');n.dispatchEvent(new Event('input',{bubbles:true}));})()");
      await click("保存草稿"); await until(async () => (await read()).version === 2, "saved internal material"); const facts = (await read()).quote.revisions[0].priceVersions[0].fabrics;
      await click("收起内部面辅料"); assert.equal(await evaluate("Boolean(document.querySelector('#quote-section-fabrics'))"), false); assert.deepEqual((await read()).quote.revisions[0].priceVersions[0].fabrics, facts);
      await hasText("成衣金额不是纯工价");
    } else assert.equal(await evaluate("Boolean(document.querySelector('#quote-section-fabrics'))"), true);
    await isolated();
  });
  await t.test("actual preview drift: 409 retains every input, receipt rejection enables explicit re-review only", async () => {
    const before = await count(); await start();
    await pool.query("UPDATE quote_manufacturing_presets SET version=version+1 WHERE id=$1", [presetA.id]);
    const offset = requests.length; await click("创建报价"); await hasText("409"); await hasText("核对创建结果");
    assert.ok(await evaluate("[...document.querySelectorAll('input')].some(n=>n.value==='SYNTHETIC-TWO-STEP-UI')"));
    await sleep(200); assert.equal(requests.slice(offset).filter(r=>r.method==='POST').length, 1); assert.equal(await count(), before);
    await click("核对创建结果"); await hasText("创建已拒绝"); await click("核对制作参数"); await hasText("制作参数已配置"); assert.equal(await count(), before); await click("取消"); await isolated();
  });
  await t.test("actual committed-but-response-lost uses original receipt after reload, never duplicate POST/number", async () => {
    await start(); const before = await count(), offset = requests.length;
    await command("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/quotes/creation-workflows", requestStage: "Response" }] }, sessionId);
    try { await click("创建报价"); await hasText("核对创建结果"); } finally { await command("Fetch.disable", {}, sessionId); }
    assert.equal(await count(), before + 1);
    const token = await evaluate("new URLSearchParams(location.search).get('creationRequestId')"); assert.ok(token);
    await navigate(`/quote-center/new?creationRequestId=${token}`); await hasText("核对创建结果"); await click("核对创建结果");
    await until(async () => await evaluate("location.pathname==='/quote-center/detail'"), "receipt recovered original detail"); await hasText("Server 报价 · v1");
    assert.equal(await count(), before + 1); assert.equal(requests.slice(offset).filter(r=>r.method==='POST').length, 1);
    assert.deepEqual(await evaluate("unhandledRejections"), []); await isolated();
  });
}
