import assert from 'node:assert/strict';
import { createQuoteDraft } from '../../features/quote-center/model/quote-view-model.ts';
import { quoteSnapshotFromBrowser } from '../quotes/model.ts';
import { createQuoteRepository } from '../quotes/repository.ts';
import { createAttachmentService } from '../attachments/service.ts';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';

/** Uses only the existing formal UI harness's disposable pool and fresh profile. */
export async function runD099ListAcceptance({ t, pool, storage, requests, navigate, hasText, input, labelInput, click, action, evaluate, command, sessionId, sleep, until, isolated }) {
  const fixture = createQuoteDraft('synthetic-d099-list', 'SYNTHETIC-D099', '2026-10-09');
  fixture.revisions[0].baseInfo.quoteStyleNo = 'SYNTHETIC-LONG-STYLE-IDENTITY-100PX';
  fixture.revisions[0].baseInfo.styleName = 'Synthetic long garment name for narrow column ellipsis';
  const price = fixture.revisions[0].priceVersions[0];
  price.quantity = 1200;
  price.labor = {value: 7.5, description: 'Synthetic alignment labor'};
  price.fabrics = [{id:'alignment-fabric',sourceLibraryItemId:null,name:'Synthetic fabric',composition:'',segmentLengthCm:100,netWidthCm:100,gsm:200,lossRate:0,supplier:'',unitPrice:36.5,purchaseUnit:'meter'}];
  price.trims = [{id:'alignment-trim',sourceLibraryItemId:null,name:'Synthetic trim',specification:'',usage:1,unit:'piece',lossRate:0,supplier:'',unitPrice:6.69}];
  await createQuoteRepository(pool).create(quoteSnapshotFromBrowser(fixture));
  await navigate('/quote-center'); await hasText('登录织序 Server');
  await input('input[name=username]', 'synthetic-ui-admin'); await input('input[name=password]', 'disposable-ui-password'); await click('登录 Server'); await hasText('本页 1');
  const measure = () => evaluate(`Object.fromEntries([...document.querySelectorAll('thead th')].map(n=>[n.dataset.columnKey,n.getBoundingClientRect().width]))`);
  const measurements = [];
  const folder = process.env.ZHIXU_D099_EVIDENCE ? resolve(process.env.ZHIXU_D099_EVIDENCE) : null;
  if(folder) await mkdir(folder,{recursive:true});
  for (const mode of ['original','fields']) {
    if(mode==='fields') await action('独立字段视图');
    for (const width of [1920,1440,1280,900]) await t.test(`D099 actual DOM pixel resize ${mode}/${width} (fine-pointer desktop)`, async (resizeTest) => {
    await command('Emulation.setDeviceMetricsOverride', { width, height:800, deviceScaleFactor:1, mobile:false }, sessionId);
    await sleep(150);
    assert.equal(await evaluate("matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches"), true);
    await resizeTest.test(`quantity${mode === 'original' ? ' and grouped costs' : ''} header/content left edges`, async () => {
      const alignment = await evaluate(`(() => {
        const keys = ${JSON.stringify(mode === 'original' ? ['quantity', 'fabricCost'] : ['quantity'])};
        return keys.map(key => {
          const th = document.querySelector('th[data-column-key="'+key+'"]');
          const td = document.querySelector('tbody td[data-column-key="'+key+'"]');
          const title = th.querySelector('.qc-table-heading > span:last-child');
          const lines = [...td.querySelectorAll('.qc-primary-cell > strong, .qc-primary-cell > small')];
          const textLeft = node => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect().left; };
          return { key, headerAlign: getComputedStyle(th).textAlign, cellAlign: getComputedStyle(td).textAlign,
            padding: parseFloat(getComputedStyle(td).paddingLeft), headerPadding: parseFloat(getComputedStyle(th).paddingLeft),
            titleLeft: textLeft(title), cellLeft: td.getBoundingClientRect().left,
            lines: lines.map(n => ({left: textLeft(n), align: getComputedStyle(n).textAlign, text: n.textContent})) };
        });
      })()`);
      t.diagnostic(JSON.stringify({mode,width,alignment}));
      for (const cell of alignment) {
        assert.equal(cell.headerAlign, 'left', `${cell.key} header is left aligned`);
        assert.equal(cell.cellAlign, 'left', `${cell.key} data is left aligned`);
        assert.ok(cell.padding >= 8 && cell.padding === cell.headerPadding, 'Normal matching padding');
        for (const line of cell.lines) {
          assert.equal(line.align, 'left');
          assert.ok(Math.abs(line.left - cell.titleLeft) <= 1, 'Header and actual text share left edge');
          assert.ok(Math.abs(line.left - cell.cellLeft - cell.padding) <= 1, 'Content starts at normal cell padding');
        }
        if (cell.key === 'fabricCost') {
          assert.equal(cell.lines.length, 2);
          assert.match(cell.lines[0].text, /^面 /);
          assert.match(cell.lines[1].text, /^辅 .* · 工 /);
          assert.match(cell.lines[0].text, /\d/);
          assert.match(cell.lines[1].text, /6\.69/);
          assert.match(cell.lines[1].text, /7\.50/);
        }
        if (cell.key === 'quantity') assert.equal(cell.lines[0].text.replaceAll(',', ''), '1200');
      }
      if (mode === 'fields') assert.deepEqual(await evaluate(`['fabricCost','trimCost','labor'].map(key =>
        ['th','tbody td'].map(selector => getComputedStyle(document.querySelector(selector+'[data-column-key="'+key+'"]')).textAlign))`),
        [['right','right'],['right','right'],['right','right']], 'Independent monetary columns retain their existing numeric alignment');
    });
    const before = await measure();
    const point = await evaluate(`(()=>{const r=document.querySelector('th[data-column-key=brand] .qc-column-resize-handle').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await command('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',clickCount:1},sessionId);
    await sleep(30);
    await command('Input.dispatchMouseEvent', {type:'mouseMoved',x:point.x+40,y:point.y,button:'left',buttons:1},sessionId);
    await sleep(30);
    await command('Input.dispatchMouseEvent', {type:'mouseReleased',x:point.x+40,y:point.y,button:'left',clickCount:1},sessionId);
    await sleep(100); const after = await measure();
    t.diagnostic(JSON.stringify({width,before,after}));
    measurements.push({mode,width,before,after});
    assert.ok(Math.abs(after.brand-before.brand-40)<=1, 'Dragged column changes by 40px');
    for(const key of Object.keys(before).filter(k=>k!=='brand')) assert.ok(Math.abs(after[key]-before[key])<=1, `Untouched ${key} stays fixed`);
    assert.equal(await evaluate('document.documentElement.scrollWidth'),width);
    await evaluate("document.querySelector('.qc-table-wrap').scrollLeft=10000");
    assert.ok(await evaluate("(()=>{const a=document.querySelector('th[data-column-key=action]').getBoundingClientRect();const b=document.querySelector('.qc-table-wrap').getBoundingClientRect();return a.right<=b.right+1&&a.left>=b.left})()"));
    await evaluate("document.querySelector('.qc-table-wrap').scrollLeft=0");
    if(folder) { const {data}=await command('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(join(folder,`${mode}-${width}.png`),Buffer.from(data,'base64')); }
    });
  }
  await action('原版组合视图');
  await t.test('D099 style identity numeric 100px persists after reload and presentation switches',async()=>{
    assert.ok((await measure()).styleIdentity>=156,'Default content column may expand to fill; explicit 100px below remains exact');
    await action('列表页面设置');await hasText('报价列表页面设置');
    await evaluate("[...document.querySelectorAll('.qc-column-width-settings label')].find(n=>n.textContent.includes('款号 / 款式名称')).querySelector('input').focus()");
    await labelInput('款号 / 款式名称','100');await click('保存设置');await sleep(100);
    assert.equal((await measure()).styleIdentity,100,'Displayed column must match requested 100px');
    await navigate('/quote-center');await hasText('本页 1');assert.equal((await measure()).styleIdentity,100);
    await action('列表页面设置');await hasText('报价列表页面设置');
    assert.equal(await evaluate("[...document.querySelectorAll('.qc-column-width-settings label')].find(n=>n.textContent.includes('款号 / 款式名称')).querySelector('input').value"),'100');
    await click('取消');
    for(const mode of ['fields','original']) {
      await action(mode==='fields'?'独立字段视图':'原版组合视图');
      for(const width of [1920,1440,1280,900]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false},sessionId);await sleep(100);
        assert.equal((await measure()).styleIdentity,100);
        const actual=await evaluate(`(()=>{const th=document.querySelector('th[data-column-key=styleIdentity]'),td=document.querySelector('tbody td[data-column-key=styleIdentity]'),title=th.querySelector('.qc-table-heading > span:last-child'),range=document.createRange();range.selectNodeContents(title);return{headerWidth:th.getBoundingClientRect().width,cellWidth:td.getBoundingClientRect().width,titleWrap:getComputedStyle(title).whiteSpace,titleHeight:title.getBoundingClientRect().height,titleLines:range.getClientRects().length,lines:[...td.querySelectorAll('.qc-primary-cell > *')].map(n=>({overflow:getComputedStyle(n).overflow,textOverflow:getComputedStyle(n).textOverflow,width:n.getBoundingClientRect().width,client:n.clientWidth,scroll:n.scrollWidth}))}})()`);
        assert.equal(actual.cellWidth,100);assert.equal(actual.titleWrap,'normal');assert.ok(actual.titleLines>=2,'Narrow title actually wraps');
        for(const line of actual.lines){assert.equal(line.overflow,'hidden');assert.equal(line.textOverflow,'ellipsis');assert.ok(line.width<=76);assert.ok(line.scroll>line.client,'Long text is truncated, not widening column');}
        t.diagnostic(JSON.stringify({mode,width,style100:actual}));
      }
    }
  });
  await t.test('D099 invalid width remains visible with explicit validation and no preference write',async()=>{
    await action('列表页面设置');await hasText('报价列表页面设置');
    const prior=await evaluate("Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('zhixu.ui.server.quote-list.v1.'))) ");
    for(const raw of ['79','721','100.5','','invalid']) {
      await labelInput('款号 / 款式名称',raw);
      assert.equal(await evaluate("[...document.querySelectorAll('.qc-column-width-settings label')].find(n=>n.textContent.includes('款号 / 款式名称')).querySelector('input').value"),raw);
      assert.equal(await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent==='保存设置').disabled"),true);
      await hasText('当前输入不会保存');
      await evaluate("document.querySelector('form[role=dialog]').requestSubmit()");await sleep(30);
      assert.deepEqual(await evaluate("Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('zhixu.ui.server.quote-list.v1.')))"),prior);
    }
    await labelInput('款号 / 款式名称','100');await click('保存设置');assert.equal((await measure()).styleIdentity,100);
  });
  await t.test('D099 style drag/keyboard share 80px floor without squeezing other columns',async()=>{
    for(const mode of ['fields','original']) {
      await action(mode==='fields'?'独立字段视图':'原版组合视图');await sleep(100);
      const before=await measure(),point=await evaluate("(()=>{const r=document.querySelector('th[data-column-key=styleIdentity] .qc-column-resize-handle').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
      await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1},sessionId);
      await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x-60,y:point.y,button:'left',buttons:1},sessionId);
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x-60,y:point.y,button:'left',clickCount:1},sessionId);await sleep(100);
      assert.equal((await measure()).styleIdentity,80);
      await evaluate("document.querySelector('th[data-column-key=styleIdentity] .qc-column-resize-handle').focus()");
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37},sessionId);await sleep(50);
      assert.equal((await measure()).styleIdentity,80);
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},sessionId);await sleep(50);
      const after=await measure();assert.equal(after.styleIdentity,88);
      for(const key of Object.keys(before).filter(k=>k!=='styleIdentity'))assert.ok(Math.abs(after[key]-before[key])<=1,`${key} remains unchanged`);
      await action('列表页面设置');await labelInput('款号 / 款式名称','100');await click('保存设置');
    }
  });
  await t.test('D099 numeric settings address actual grouped cost cell',async()=>{
    await action('列表页面设置');await hasText('报价列表页面设置');
    assert.equal(await evaluate("[...document.querySelectorAll('.qc-column-width-settings label')].some(n=>n.textContent.includes('成本摘要'))"),true);
    await labelInput('成本摘要','277');await click('保存设置');await sleep(100);
    assert.equal((await measure()).fabricCost,277);
    await navigate('/quote-center');await hasText('本页 1');assert.equal((await measure()).fabricCost,277);
  });
  await t.test('D099 keyboard width/order isolation, reload and trusted-user preference persistence',async()=>{
    const before=await measure();
    await evaluate("document.querySelector('th[data-column-key=fabricCost] .qc-column-resize-handle').focus()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39},sessionId);
    await sleep(100); const after=await measure();assert.equal(after.fabricCost,before.fabricCost+8);
    for(const key of Object.keys(before).filter(k=>k!=='fabricCost'))assert.ok(Math.abs(after[key]-before[key])<=1);
    // Native HTML drag/drop path, independent from pointer resize; same rendered handlers.
    const old=await evaluate("[...document.querySelectorAll('thead th')].map(n=>n.dataset.columnKey)");
    await evaluate("(()=>{const d=new DataTransfer(),a=document.querySelector('th[data-column-key=brand]'),b=document.querySelector('th[data-column-key=styleIdentity]');a.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:d}));b.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:d}));})()");
    await until(()=>evaluate("Boolean(document.querySelector('th[data-column-key=brand]'))"),'reordered summary ready');const ordered=await evaluate("[...document.querySelectorAll('thead th')].map(n=>n.dataset.columnKey)");assert.notDeepEqual(ordered,old);assert.ok(ordered.indexOf('brand')<ordered.indexOf('styleIdentity'));
    await navigate('/quote-center');await hasText('本页 1');assert.deepEqual(await evaluate("[...document.querySelectorAll('thead th')].map(n=>n.dataset.columnKey)"),ordered);assert.equal((await measure()).fabricCost,after.fabricCost);
  });
  const login = async name => {
    await evaluate("fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Zhixu-Request':'1'}})");
    await navigate('/quote-center');await hasText('登录织序 Server');await input('input[name=username]',`synthetic-ui-${name}`);await input('input[name=password]','disposable-ui-password');await click('登录 Server');await hasText('本页 1');
  };
  await t.test('D099 relogin preserves group width; another trusted account has independent defaults',async()=>{
    await login('viewer');assert.ok((await measure()).fabricCost>=126);
    await login('admin');assert.equal((await measure()).fabricCost,285);assert.equal((await measure()).styleIdentity,100);
  });
  await t.test('D099 old v1 preferences are read-only compatible; explicit restore only',async()=>{
    const old={visibleColumns:['brand','salesperson'],columnOrder:['salesperson','brand'],columnWidths:{brand:255,salesperson:310}};
    await evaluate(`(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('zhixu.ui.server.quote-list.v1.'));window.d099OldKey=key;localStorage.setItem(key,${JSON.stringify(JSON.stringify(old))});})()`);
    await navigate('/quote-center');await hasText('本页 1');assert.equal((await measure()).brand,255);assert.equal((await measure()).salesperson,310);
    assert.deepEqual(await evaluate("JSON.parse(Object.values(localStorage).find(v=>v.includes('\"salesperson\":310')))"),old);
    await action('列表页面设置');await hasText('报价列表页面设置');await click('恢复默认布局');await click('保存设置');await until(()=>evaluate("Boolean(document.querySelector('th[data-column-key=styleIdentity]'))"),'restored summary ready');assert.ok((await measure()).brand>=88,'responsive default stays readable; legacy manual pixels were preserved until explicit restore');
  });
  const user=(await pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic-ui-admin'")).rows[0];
  const actor={internalUserId:user.id,userId:user.public_id,username:'synthetic-ui-admin',userName:'Synthetic',permissions:['quote.view','quote.edit']};
  const service=createAttachmentService(pool,storage),quoteId='synthetic-d099-list';
  const revisionId=(await pool.query('SELECT default_revision_id FROM quote_center_quotes WHERE id=$1',[quoteId])).rows[0].default_revision_id;
  const bytes=await sharp({create:{width:600,height:300,channels:3,background:'#39705e'}}).png().toBuffer();
  const first=await service.upload(actor,quoteId,revisionId,1,{name:'synthetic-list.png',mimeType:'image/png',kind:'image',bytes,uploadToken:'00000000-0000-4000-8000-000000000001'});
  await t.test('D099 real related image renders bytes/hash, no per-row full aggregate read',async()=>{
    const start=requests.length;await navigate('/quote-center');await hasText('本页 1');
    await until(()=>evaluate("Boolean(document.querySelector('tbody .qc-quote-list-thumbnail img')?.naturalWidth)"),'actual list image decode');
    const actual=Buffer.from(await evaluate("fetch(document.querySelector('tbody .qc-quote-list-thumbnail img').src).then(r=>r.arrayBuffer()).then(b=>Array.from(new Uint8Array(b)))"));
    assert.notDeepEqual(actual,bytes);
    const meta=await sharp(actual).metadata();assert.deepEqual([meta.width,meta.height],[256,128]);
    const original=await service.download(actor,quoteId,revisionId,first.attachment.id);
    const chunks=[];for await(const chunk of original.stream)chunks.push(chunk);
    assert.equal(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'),first.attachment.sha256);
    assert.equal(requests.slice(start).filter(r=>r.path.endsWith('/thumbnail')).length,1);
    assert.equal(requests.slice(start).filter(r=>r.path.endsWith('/download')).length,0,'List receives no originals');
    assert.equal(requests.slice(start).filter(r=>/^\/api\/v1\/quotes\/[^/]+$/.test(r.path)).length,0);
    assert.ok(await evaluate("(()=>{const r=document.querySelector('tbody .qc-quote-list-thumbnail img').getBoundingClientRect();return r.width<=48&&r.height<=48})()"));
    if(folder){const{data}=await command('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(join(folder,'related-image.png'),Buffer.from(data,'base64'));}
  });
  await t.test('D099 image switches, missing object, invalid relation and unlink show correct safe state',async()=>{
    const second=await service.upload(actor,quoteId,revisionId,2,{name:'second.png',mimeType:'image/png',kind:'image',bytes,uploadToken:'00000000-0000-4000-8000-000000000002'});
    await service.style(actor,quoteId,revisionId,second.attachment.id,3);await navigate('/quote-center');await hasText('本页 1');await until(()=>evaluate("Boolean(document.querySelector('tbody .qc-quote-list-thumbnail img')?.naturalWidth)"),'switched image');
    storage.objects.delete(`attachments/${second.attachment.id}/original`);await navigate('/quote-center');await hasText('本页 1');await hasText('本页 1');await until(()=>evaluate("Boolean(document.querySelector('tbody [aria-label=款式图不可用]'))"),'unavailable placeholder');
    await pool.query("UPDATE quote_center_revisions SET metadata=jsonb_set(metadata,'{styleImageAttachmentId}',to_jsonb($3::text)) WHERE quote_id=$1 AND id=$2",[quoteId,revisionId,first.attachment.id]);
    const start=requests.length;await navigate('/quote-center');await hasText('本页 1');assert.ok(await evaluate("Boolean(document.querySelector('tbody [aria-label=未设置款式图]'))"));assert.equal(requests.slice(start).filter(r=>r.path.endsWith('/download')).length,0,'Invalid non-style relation never fetched');
    await service.unlink(actor,quoteId,revisionId,second.attachment.id,4);await navigate('/quote-center');await hasText('本页 1');assert.ok(await evaluate("Boolean(document.querySelector('tbody [aria-label=未设置款式图]'))"));
  });
  await t.test('D099 hidden/permission-restricted images issue no reads; visible URL revoked on hide/logout',async()=>{
    await service.style(actor,quoteId,revisionId,first.attachment.id,5);await navigate('/quote-center');await hasText('本页 1');await until(()=>evaluate("Boolean(document.querySelector('tbody .qc-quote-list-thumbnail img')?.naturalWidth)"),'available first image');
    const url=await evaluate("document.querySelector('tbody .qc-quote-list-thumbnail img').src");
    await action('列表页面设置');await hasText('报价列表页面设置');await evaluate("[...document.querySelectorAll('.qc-column-order-settings label')].find(n=>n.querySelector('strong')?.textContent==='款式图').querySelector('input').click()");await click('保存设置');await sleep(100);
    assert.ok(await evaluate(`window.revokedObjectURLs.includes(${JSON.stringify(url)})`));
    const start=requests.length;await navigate('/quote-center');await hasText('本页 1');await sleep(100);assert.equal(requests.slice(start).filter(r=>r.path.endsWith('/download')).length,0);
    await login('viewer');await until(()=>evaluate("Boolean(document.querySelector('tbody .qc-quote-list-thumbnail img')?.naturalWidth)"),'viewer authorized image');
    await pool.query("DELETE FROM app_role_permissions WHERE role_id='synthetic-ui-role-viewer' AND permission_key='quote.view'");
    const restrictedStart=requests.length;await navigate('/quote-center');await hasText('需要 quote.view');await sleep(100);assert.equal(requests.slice(restrictedStart).filter(r=>r.path.endsWith('/download')).length,0);assert.equal(await evaluate("document.querySelectorAll('.qc-quote-list-thumbnail img').length"),0);
    await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('synthetic-ui-role-viewer','quote.view')");
    await login('admin');
  });
  if(folder)await writeFile(join(folder,'pixels.json'),JSON.stringify(measurements,null,2));
  await isolated();
}
