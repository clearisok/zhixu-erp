import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createQuoteMasterService} from '../quote-masters/service.ts';
import {permissionsForUser} from '../auth/permissions.ts';
import {createQuoteRepository} from '../quotes/repository.ts';

export async function runDirectCreation({t,pool,requests,navigate,hasText,click,evaluate,command,sessionId,sleep,until,isolated,loginAs}) {
  await loginAs('admin');
  const user=(await pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic-ui-admin'")).rows[0];
  const actor={internalUserId:user.id,userId:user.public_id,userName:'Synthetic admin',username:'synthetic-ui-admin',permissions:await permissionsForUser(pool,user.id)};
  const master=createQuoteMasterService(pool);
  const preset=await master.createPreset(actor,{name:'Direct synthetic Cambodia',country:'Cambodia',laborCurrency:'USD',markupRate:'0',includeFreight:true,freightName:'Synthetic freight',freightAmount:'0',status:'active'});
  const count=async()=>Number((await pool.query('SELECT count(*) FROM quote_center_quotes')).rows[0].count);
  let createdId;
  const select=async(id)=>evaluate(`document.querySelector('[aria-label="默认制作方案"] [data-scheme-id="'+${JSON.stringify(id)}+'"]').click()`);
  await t.test('formal global defaults UI saves matching processing scheme; list click directly creates exactly one draft',async()=>{
    await navigate('/system-settings/quote-settings');await hasText('新建报价默认值');
    await until(()=>evaluate("![...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='保存报价设置')?.disabled"),'settings loaded');
    await click('加工报价');await select(preset.id);await click('保存报价设置');await hasText('报价默认参数已保存');
    const before=await count(),offset=requests.length;
    await navigate('/quote-center');await hasText('＋ 新建报价');
    await evaluate("(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='＋ 新建报价');n.click();n.click();})()");
    await until(()=>evaluate("location.pathname==='/quote-center/detail'"),'direct detail');await hasText('草稿已创建并保留');
    const id=await evaluate("new URLSearchParams(location.search).get('id')");
    createdId=id;
    const read=()=>evaluate(`fetch('/api/v1/quotes/'+${JSON.stringify(id)}).then(r=>r.json()).then(b=>b.quote)`);
    const record=await read(),pv=record.quote.revisions[0].priceVersions[0];
    assert.equal(record.quote.revisions[0].baseInfo.quoteType,'processing');assert.equal(pv.pricingParameters.manufacturingPresetId,preset.id);
    assert.equal(pv.pricingParameters.freightAmount,null,'Processing read omits the inapplicable freight amount');
    const stored=await createQuoteRepository(pool).getById(id);
    assert.equal(stored.quote.revisions[0].priceVersions[0].pricingParameters.freightAmount,'0','The original configured snapshot remains stored');
    assert.equal(await count(),before+1);assert.equal(requests.slice(offset).filter(r=>r.method==='POST'&&r.path==='/api/v1/quotes/creation-defaults').length,1);
    await navigate(`/quote-center/detail?id=${id}`);await hasText('草稿已创建并保留');await navigate('/quote-center');await hasText('＋ 新建报价');
    assert.equal(await count(),before+1,'refresh and returning retain empty draft without another create');await isolated();
  });
  await t.test('settings 409 preserves current selected scheme and type',async()=>{
    await navigate('/system-settings/quote-settings');await hasText('新建报价默认值');await sleep(300);
    await select('');await click('经销报价');
    assert.equal(await evaluate("document.querySelector('[aria-label=默认制作方案] [aria-checked=true]').dataset.schemeId"),'');
    const before=await master.getGlobalSettings(actor);
    await master.updateGlobalSettings(actor,before.version,{...before});
    await click('保存报价设置');await hasText('当前草稿未覆盖');
    assert.equal(await evaluate("document.querySelector('[aria-label=默认制作方案] [aria-checked=true]').dataset.schemeId"),'');
    assert.equal((await master.getGlobalSettings(actor)).defaultManufacturingCountry,'Cambodia');await isolated();
  });
  await t.test('two-section settings and uncluttered detail five widths have no page overflow; screenshots use synthetic data only',async()=>{
    // Ordinary test runs must preserve the committed historical screenshots.
    const folder=resolve('outputs/quote-pr91-direct-creation',String(Date.now()));await mkdir(folder,{recursive:true});
    for(const width of [1920,1440,1280,900,390]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:800,deviceScaleFactor:1,mobile:width===390},sessionId);
      await command('Emulation.setTouchEmulationEnabled',{enabled:width===390},sessionId);
      await navigate('/system-settings/quote-settings');await hasText('新建报价默认值');await sleep(200);
      const metrics=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})");
      assert.ok(metrics.scroll<=metrics.client+1,JSON.stringify(metrics));
      const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
      await writeFile(join(folder,`settings-${width}.png`),Buffer.from(data,'base64'));
      await navigate(`/quote-center/detail?id=${createdId}`);await hasText('草稿已创建并保留');await sleep(200);
      const strip=await evaluate("(()=>{const n=document.querySelector('.qc-creation-summary'),r=n?.getBoundingClientRect();return {width:innerWidth,page:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,strip: r?{left:r.left,right:r.right,scroll:n.scrollWidth,client:n.clientWidth}:null};})()");
      assert.equal(strip.strip,null);assert.ok(strip.page<=strip.client+1,JSON.stringify(strip));assert.equal(await evaluate("document.querySelector('.qc-server-detail-status')!==null"),false);
      const detail=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
      await writeFile(join(folder,`detail-${width}.png`),Buffer.from(detail.data,'base64'));
      await isolated();
    }
    await command('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false},sessionId);await command('Emulation.setTouchEmulationEnabled',{enabled:false},sessionId);
  });
  await t.test('trusted no-settings-edit identity reads settings but cannot save defaults',async()=>{
    await loginAs('viewer');await navigate('/system-settings/quote-settings');await hasText('报价设置');await sleep(300);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='保存报价设置')?.disabled"),true);
    const status=await evaluate("fetch('/api/v1/quote-settings',{method:'PATCH',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({expectedVersion:0,defaultQuoteType:'processing',defaultManufacturingCountry:null,defaultManufacturingPresetId:null,defaultUsdCnyRate:null,defaultMarkupRate:null,defaultLaborCurrency:'CNY',defaultLaborDescription:'',defaultOtherCost:null})}).then(r=>r.status)");assert.equal(status,403);await isolated();await loginAs('admin');
  });
}
