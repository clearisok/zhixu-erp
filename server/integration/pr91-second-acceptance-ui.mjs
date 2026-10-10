import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createQuoteMasterService} from '../quote-masters/service.ts';
import {permissionsForUser} from '../auth/permissions.ts';

/** All accounts, data, network failures and screenshots belong to the harness. */
export async function runSecondAcceptance({t,pool,requests,navigate,hasText,labelInput,click,action,evaluate,command,sessionId,sleep,until,isolated,loginAs}) {
  const check = async (name, fn) => {
    let failure;
    await t.test(name, async () => { try { await fn(); assert.deepEqual(await evaluate('unhandledRejections'),[]); assert.deepEqual(await evaluate('browserErrors'),[]); } catch (error) { failure=error; throw error; } });
    if (failure) throw failure; // Dependent fixture failures must not cascade.
  };
  await loginAs('admin');
  const user=(await pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic-ui-admin'")).rows[0];
  const actor={internalUserId:user.id,userId:user.public_id,userName:'Synthetic admin',username:'synthetic-ui-admin',permissions:await permissionsForUser(pool,user.id)};
  const master=createQuoteMasterService(pool);
  const loaded=()=>until(()=>evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='保存报价设置');return b&&!b.disabled})()"),'settings loaded');
  const saveSettings=async()=>{
    const version=(await master.getGlobalSettings())?.version??0;
    await click('保存报价设置');
    await until(async()=>((await master.getGlobalSettings())?.version??0)>version,'new settings transaction committed');
    await loaded();await until(()=>evaluate("!document.querySelector('.qc-system-settings-actions').textContent.includes('有未保存修改')"),'new settings baseline adopted');
    await hasText('报价默认参数已保存');
  };
  const choose=async(id,scope='默认制作方案')=>evaluate(`document.querySelector('[role="radiogroup"][aria-label="'+${JSON.stringify(scope)}+'"] [data-scheme-id="'+${JSON.stringify(id)}+'"]').click()`);
  const folder=resolve('docs/tasks/active/evidence/quote-pr91-second-acceptance');await mkdir(folder,{recursive:true});
  const metrics=[];
  const capture=async(name)=>{const{data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);await writeFile(join(folder,name+'.png'),Buffer.from(data,'base64'));};
  const viewport=async(width)=>{
    await command('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:864,deviceScaleFactor:width===1536?1.25:1,mobile:width===390},sessionId);
    await command('Emulation.setTouchEmulationEnabled',{enabled:width===390,maxTouchPoints:1},sessionId);
    await command('Emulation.setEmulatedMedia',{features:width===390?[{name:'pointer',value:'coarse'},{name:'hover',value:'none'}]:[{name:'pointer',value:'fine'},{name:'hover',value:'hover'}]},sessionId);
  };
  let china, other, cambodia, quoteId;
  await check('formal settings has exactly two sections; UI creates multiple factory schemes in the same country',async()=>{
    await navigate('/system-settings/quote-settings');await hasText('新建报价默认值');await loaded();
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.qc-system-settings-section > header strong')].map(n=>n.textContent)"),['制作方案管理','新建报价默认值']);
    assert.equal(await evaluate("[...document.querySelectorAll('label.qc-form-item')].some(n=>/默认制作国家|默认制作预设|默认其他费用|默认工序说明/.test(n.textContent))"),false);
    for(const [name,country,currency,markup] of [['柬凯制作（合成）','柬埔寨','USD','5'],['均涛工厂·宁波（合成）','中国','CNY','13'],['其他工厂（合成）','中国','CNY','10']]){
      await click('＋ 新增制作方案');await labelInput('方案名称',name);await labelInput('制作国家',country);await click(currency);await labelInput('成本加成率',markup);
    }
    await saveSettings();
    const presets=await master.listPresets();china=presets.find(p=>p.name.startsWith('均涛'));other=presets.find(p=>p.name.startsWith('其他工厂'));cambodia=presets.find(p=>p.name.startsWith('柬凯'));
    assert.ok(china&&other&&cambodia);assert.notEqual(china.id,other.id);assert.equal(china.country,other.country);await isolated();
  });
  await check('explicit scheme ID saves country atomically; hidden legacy global supplements stay stored but never enter new drafts',async()=>{
    const old=await master.getGlobalSettings();await master.updateGlobalSettings(actor,old.version,{...old,defaultLaborDescription:'HIDDEN-LEGACY-DESCRIPTION',defaultOtherCost:{name:'HIDDEN-LEGACY-FEE',amount:'9.25'}});
    await navigate('/system-settings/quote-settings');await hasText('新建报价默认值');await loaded();
    for(const scheme of [china,other,cambodia]){await choose(scheme.id);await saveSettings();assert.equal((await master.getGlobalSettings()).defaultManufacturingPresetId,scheme.id);assert.equal((await master.getGlobalSettings()).defaultManufacturingCountry,scheme.country);}
    await click('经销报价');await saveSettings();
    const saved=await master.getGlobalSettings();assert.equal(saved.defaultLaborDescription,'HIDDEN-LEGACY-DESCRIPTION');assert.equal(saved.defaultOtherCost.amount,'9.25');
    await navigate('/quote-center');await hasText('＋ 新建报价');await click('＋ 新建报价');await hasText('草稿已创建并保留');
    quoteId=await evaluate("new URLSearchParams(location.search).get('id')");
    const record=await evaluate(`fetch('/api/v1/quotes/${quoteId}').then(r=>r.json()).then(b=>b.quote)`),pv=record.quote.revisions[0].priceVersions[0];
    assert.equal(record.quote.revisions[0].baseInfo.quoteType,'distribution');assert.equal(pv.pricingParameters.manufacturingPresetId,cambodia.id);assert.equal(pv.labor.description,'');assert.ok(pv.otherCosts.every(n=>n.name!=='HIDDEN-LEGACY-FEE'));await isolated();
  });
  await check('scheme card arrow keyboard selection works; changing and disabling a default preserves old Quote snapshots',async()=>{
    const before=await evaluate(`fetch('/api/v1/quotes/${quoteId}').then(r=>r.json()).then(b=>b.quote)`);
    await navigate('/system-settings/quote-settings');await hasText('新建报价默认值');await loaded();await choose(china.id);
    await evaluate(`document.querySelector('[aria-label="默认制作方案"] [data-scheme-id="${china.id}"]').focus()`);
    const expectedNext=await evaluate(`(()=>{const options=[...document.querySelectorAll('[aria-label="默认制作方案"] [role=radio]')],i=options.findIndex(n=>n.dataset.schemeId==='${china.id}');return options[(i+1)%options.length].dataset.schemeId})()`);
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'},sessionId);await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'},sessionId);
    assert.equal(await evaluate("document.querySelector('[aria-label=默认制作方案] [aria-checked=true]').dataset.schemeId"),expectedNext);
    await choose(cambodia.id);await saveSettings();
    await evaluate(`document.querySelectorAll('.qc-preset-master button').forEach(n=>{if(n.textContent.includes(${JSON.stringify(cambodia.name)}))n.click()})`);
    await labelInput('制作国家','越南');assert.equal(await evaluate("document.querySelector('[aria-label=默认制作方案] [aria-checked=true]').dataset.schemeId"),'');
    await click('停用方案');await saveSettings();
    assert.equal((await master.getGlobalSettings()).defaultManufacturingPresetId,null);assert.equal((await master.getGlobalSettings()).defaultManufacturingCountry,null);
    assert.deepEqual(await evaluate(`fetch('/api/v1/quotes/${quoteId}').then(r=>r.json()).then(b=>b.quote)`),before);
    await click('启用方案');await labelInput('制作国家','柬埔寨');await saveSettings();await isolated();
  });
  await check('pricing scheme cards update only current PV; global factory/default and saved source stay untouched until Quote save',async()=>{
    await navigate(`/quote-center/detail?id=${quoteId}`);await hasText('草稿已创建并保留');await click('报价设置');await hasText('当前价格版本制作方案');
    assert.equal(await evaluate("document.querySelector('.qc-pricing-settings-modal select')!==null"),false);
    await choose(china.id,'当前价格版本制作方案');
    assert.equal(await evaluate("[...document.querySelectorAll('.qc-pricing-preset-summary dd')].map(n=>n.textContent).join('|')"),'中国|CNY|13%|不带入默认运费');
    await capture('pricing-scheme-desktop');await click('完成');await click('保存草稿');await hasText('报价已保存到 Server');
    const saved=await evaluate(`fetch('/api/v1/quotes/${quoteId}').then(r=>r.json()).then(b=>b.quote)`);
    assert.equal(saved.quote.revisions[0].priceVersions[0].pricingParameters.manufacturingPresetId,china.id);assert.equal((await master.getGlobalSettings()).defaultManufacturingPresetId,null);assert.equal((await master.listPresets()).find(p=>p.id===china.id).markupRate,'13');await isolated();
  });
  await check('failed master read is localized to base fields with safe retry and no Browser fallback',async()=>{
    await command('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/quote-settings/manufacturing-presets*',requestStage:'Request'}]},sessionId);
    await navigate(`/quote-center/detail?id=${quoteId}`);await hasText('品牌与报价设置读取失败');
    assert.equal(await evaluate("document.querySelector('.qc-server-detail-status')!==null"),false);
    assert.ok(await evaluate("document.querySelector('#quote-section-base-info').textContent.includes('读取失败')"));
    await capture('detail-local-read-error');
    await command('Fetch.disable',{},sessionId);await click('重试');await until(()=>evaluate("!document.querySelector('#quote-section-base-info').textContent.includes('读取失败')"),'localized retry');await isolated();
  });
  for(const width of [1920,1536,1440,1280,900,390]) await check(`factory selector / settings / detail actual Chromium layout ${width}${width===1536?' CSS px, DPR1.25':''}`,async()=>{
    await viewport(width);await navigate('/system-settings/quote-settings');await hasText('新建报价默认值');await loaded();await sleep(150);
    const m=await evaluate("({width:innerWidth,dpr:devicePixelRatio,page:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,sections:document.querySelectorAll('.qc-system-settings-section').length})");assert.ok(m.page<=m.client+1,JSON.stringify(m));assert.equal(m.sections,2);metrics.push(m);await capture(`settings-${width}`);
    await evaluate("document.querySelector('.qc-new-quote-defaults').scrollIntoView({block:'center'})");await sleep(100);await capture(`settings-defaults-${width}`);
    await navigate(`/quote-center/detail?id=${quoteId}`);await hasText('草稿已创建并保留');assert.equal(await evaluate("document.querySelector('.qc-creation-summary,.qc-server-detail-status')!==null"),false);await capture(`detail-${width}`);
    await click('报价设置');await hasText('当前价格版本制作方案');
    assert.ok(await evaluate("(()=>{const r=document.querySelector('.qc-pricing-settings-modal').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})()"));await capture(`pricing-${width}`);await click('完成');await isolated();
  });
  await check('default list fills actual container; dragging does not compress neighbours; 100px survives refresh and field view',async()=>{
    const measure=()=>evaluate("Object.fromEntries([...document.querySelectorAll('thead th')].map(n=>[n.dataset.columnKey,n.getBoundingClientRect().width]))");
    for(const width of [1920,1536,1440,1280,900]){
      await viewport(width);await navigate('/quote-center');await hasText('本页 25');await action('列表页面设置');await hasText('报价列表页面设置');await click('恢复默认布局');await click('保存设置');await sleep(150);
      const before=await measure(),m=await evaluate("({width:innerWidth,dpr:devicePixelRatio,table:document.querySelector('.qc-data-table').getBoundingClientRect().width,container:document.querySelector('.qc-table-wrap').clientWidth,page:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})");
      assert.ok(m.table>=m.container-1);if(width>=1280)assert.ok(Math.abs(m.table-m.container)<=1,JSON.stringify(m));assert.ok(before.type>=100);assert.ok(m.page<=m.client+1);metrics.push(m);await capture(`list-default-${width}`);
      await evaluate("document.querySelector('.qc-table-wrap').scrollLeft=0");
      const p=await evaluate("(()=>{const r=document.querySelector('th[data-column-key=brand] .qc-column-resize-handle').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
      await command('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+40,y:p.y,buttons:1},sessionId);await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+40,y:p.y,button:'left',clickCount:1},sessionId);await sleep(100);
      const after=await measure();assert.ok(Math.abs(after.brand-before.brand-40)<=1);for(const key of Object.keys(before).filter(k=>k!=='brand'))assert.ok(Math.abs(after[key]-before[key])<=1,key);
      await navigate('/quote-center');await hasText('本页 25');assert.deepEqual(await measure(),after);
    }
    await action('列表页面设置');await hasText('报价列表页面设置');await labelInput('款号 / 款式名称','100');await click('保存设置');await sleep(100);assert.equal((await measure()).styleIdentity,100);
    for(const view of ['独立字段视图','原版组合视图']){await action(view);await navigate('/quote-center');await hasText('本页 25');assert.equal((await measure()).styleIdentity,100);}
    await action('列表页面设置');await hasText('报价列表页面设置');assert.equal(await evaluate("[...document.querySelectorAll('.qc-column-width-settings label')].find(n=>n.textContent.includes('款号 / 款式名称')).querySelector('input').value"),'100');await click('取消');await isolated();
  });
  await writeFile(join(folder,'layout-metrics.json'),JSON.stringify(metrics,null,2));
  assert.equal(await evaluate("document.body.textContent.includes('HIDDEN-LEGACY-DESCRIPTION')"),false);
  assert.ok(!requests.some(n=>n.path.includes('legacy')),'no alternate business source');
  await viewport(1280);
}
