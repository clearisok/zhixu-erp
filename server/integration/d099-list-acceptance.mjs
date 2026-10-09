import assert from 'node:assert/strict';
import { createQuoteDraft } from '../../features/quote-center/model/quote-view-model.ts';
import { quoteSnapshotFromBrowser } from '../quotes/model.ts';
import { createQuoteRepository } from '../quotes/repository.ts';

/** Uses only the existing formal UI harness's disposable pool and fresh profile. */
export async function runD099ListAcceptance({ t, pool, navigate, hasText, input, click, action, evaluate, command, sessionId, sleep, isolated }) {
  await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(createQuoteDraft('synthetic-d099-list', 'SYNTHETIC-D099', '2026-10-09')));
  await navigate('/quote-center'); await hasText('登录织序 Server');
  await input('input[name=username]', 'synthetic-ui-admin'); await input('input[name=password]', 'disposable-ui-password'); await click('登录 Server'); await hasText('本页 1');
  const measure = () => evaluate(`Object.fromEntries([...document.querySelectorAll('thead th')].map(n=>[n.dataset.columnKey,n.getBoundingClientRect().width]))`);
  for (const width of [1920,1440,1280,900]) await t.test(`D099 actual DOM pixel resize ${width} (fine-pointer desktop)`, async () => {
    await command('Emulation.setDeviceMetricsOverride', { width, height:800, deviceScaleFactor:1, mobile:false }, sessionId);
    await sleep(150);
    assert.equal(await evaluate("matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches"), true);
    const before = await measure();
    const point = await evaluate(`(()=>{const r=document.querySelector('th[data-column-key=brand] .qc-column-resize-handle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await command('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',clickCount:1},sessionId);
    await command('Input.dispatchMouseEvent', {type:'mouseMoved',x:point.x+40,y:point.y,button:'left',buttons:1},sessionId);
    await command('Input.dispatchMouseEvent', {type:'mouseReleased',x:point.x+40,y:point.y,button:'left',clickCount:1},sessionId);
    await sleep(100); const after = await measure();
    t.diagnostic(JSON.stringify({width,before,after}));
    assert.ok(Math.abs(after.brand-before.brand-40)<=1, 'Dragged column changes by 40px');
    for(const key of Object.keys(before).filter(k=>k!=='brand')) assert.ok(Math.abs(after[key]-before[key])<=1, `Untouched ${key} stays fixed`);
    assert.equal(await evaluate('document.documentElement.scrollWidth'),width);
  });
  await t.test('D099 numeric settings address actual grouped cost cell',async()=>{
    await action('列表页面设置');await hasText('报价列表页面设置');
    assert.equal(await evaluate("[...document.querySelectorAll('.qc-column-width-settings label')].some(n=>n.textContent.includes('成本摘要'))"),true);
    await click('取消');
  });
  await isolated();
}
