import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createQuoteDraft } from '../../features/quote-center/model/quote-view-model.ts';
import { syntheticPNG } from '../../features/quote-center/server/__tests__/list-image-fixture.ts';
import { quoteSnapshotFromBrowser } from '../quotes/model.ts';
import { createQuoteRepository } from '../quotes/repository.ts';
import { createAttachmentService } from '../attachments/service.ts';

export async function runD099ImageMemory({ t, pool, storage, requests, navigate, hasText, input, click, evaluate, command, sessionId, sleep, until, isolated }) {
  const user=(await pool.query("SELECT id::text,public_id::text FROM app_users WHERE username='synthetic-ui-admin'")).rows[0];
  const actor={internalUserId:user.id,userId:user.public_id,username:'synthetic-ui-admin',userName:'Synthetic',permissions:['quote.view','quote.edit']};
  const service=createAttachmentService(pool,storage), repository=createQuoteRepository(pool), bytes=syntheticPNG();
  for(let i=0;i<25;i++) {
    const quote=quoteSnapshotFromBrowser(createQuoteDraft(`memory-${i}`,`MEMORY-${String(i).padStart(2,'0')}`,'2026-10-10'));
    await repository.create(quote);
    await service.upload(actor,quote.id,quote.defaultRevisionId,1,{name:'synthetic96x48.png',mimeType:'image/png',kind:'image',bytes,uploadToken:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`});
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:550,deviceScaleFactor:1,mobile:false},sessionId);
  await navigate('/quote-center');await hasText('登录织序 Server');await input('input[name=username]','synthetic-ui-admin');await input('input[name=password]','disposable-ui-password');await click('登录 Server');await hasText('本页 25');
  const scroll = async index => { await evaluate(`document.querySelectorAll('tbody tr')[${index}].scrollIntoView({block:'center'})`); await sleep(150); };
  const decoded = index => evaluate(`Boolean(document.querySelectorAll('tbody tr')[${index}].querySelector('img')?.naturalWidth)`);
  const bounded = async () => {
    assert.ok((await evaluate('activeObjectBytes()'))<=25*96*1024);
    assert.ok((await evaluate("(()=>{const seen=new Set();return [...document.querySelectorAll('.qc-quote-list-thumbnail img')].reduce((n,img)=>{if(seen.has(img.src))return n;seen.add(img.src);return n+img.naturalWidth*img.naturalHeight},0)})()"))<=25*256*256);
  };
  await t.test('P2 actual multiple-row scroll releases offscreen img/src and Blob URLs without row unmount',async()=>{
    await until(()=>evaluate("Boolean(document.querySelector('tbody tr:first-child img')?.naturalWidth)"),'first96x48 decode');
    const url=await evaluate("document.querySelector('tbody tr:first-child img').src");
    await evaluate("document.querySelector('tbody tr:last-child').scrollIntoView({block:'center'})");await sleep(300);
    assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"),25);
    assert.equal(await evaluate("document.querySelector('tbody tr:first-child img')===null"),true);
    assert.ok(await evaluate(`window.revokedObjectURLs.includes(${JSON.stringify(url)})`));
    await until(()=>decoded(24),'last96x48 decode');
    for(const index of [8,16,3,22,0]) { await scroll(index);await until(()=>decoded(index),`visible row${index}`);await bounded(); }
    assert.notEqual(await evaluate("document.querySelector('tbody tr:first-child img').src"),url,'Re-entry has a fresh URL');
    await isolated();
  });
  await t.test('P2 fast scrolling and leaving a genuine delayed protected download cancels stream',async()=>{
    await scroll(24);await until(()=>decoded(24),'last visible ready');
    const get=storage.get.bind(storage);let started=0,aborted=0;
    storage.get=async(key,signal)=>{const source=await get(key);if(!source)return null;started++;signal?.addEventListener('abort',()=>aborted++,{once:true});return Readable.from((async function*(){await sleep(1200);for await(const part of source)yield part;})());};
    try {
      await scroll(0);await until(()=>started>0,'delayed original request started');await scroll(24);
      await until(()=>aborted>0,'offscreen request AbortSignal');
      for(const i of [0,20,3,18,1,24]) await scroll(i);
      await sleep(1400);await bounded();
      assert.equal(await evaluate("document.querySelectorAll('tbody tr')[0].querySelector('img')===null"),true);
      assert.deepEqual(await evaluate('unhandledRejections'),[]);t.diagnostic(`Delayed protected streams started=${started}, aborted=${aborted}, no late offscreen img`);
    } finally {storage.get=get;}
  });
  await t.test('P2 actual component unmount removes decoded img and revokes every live URL',async()=>{
    await scroll(0);await until(()=>decoded(0),'post-delay visible image ready');
    const before=await evaluate('activeObjectURLs()');assert.ok(before.length);
    const toggleImage=async()=>{
      await evaluate("document.querySelector('[aria-label=\"更多报价操作\"]').click()");await click('列表页面设置');await hasText('报价列表页面设置');
      await evaluate("[...document.querySelectorAll('.qc-column-order-settings label')].find(n=>n.querySelector('strong')?.textContent==='款式图').querySelector('input').click()");await click('保存设置');
    };
    // Same document: hiding the column actually unmounts table/touch consumers.
    // Route navigation may reload the document and reset instrumentation instead.
    await toggleImage();
    await until(()=>evaluate('activeObjectURLs().length===0'),'unmount release');
    assert.ok(await evaluate(`${JSON.stringify(before)}.every(url=>revokedObjectURLs.includes(url))`));
    assert.equal(await evaluate("document.querySelectorAll('.qc-quote-list-thumbnail').length"),0);
    await toggleImage();await hasText('本页 25');await scroll(0);await until(()=>decoded(0),'remount decode');
  });
  const quoteId='memory-24', current=await repository.getById(quoteId), revisionId=current.quote.defaultRevisionId;
  const first=current.quote.revisions.find(r=>r.revisionId===revisionId).styleImageAttachmentId;
  await t.test('P2 style switch and unlink release old URL in same mounted list',async()=>{
    const old=await evaluate("document.querySelector('tbody tr:first-child img').src");
    const second=await service.upload(actor,quoteId,revisionId,2,{name:'portrait.png',mimeType:'image/png',kind:'image',bytes:syntheticPNG(48,96),uploadToken:'00000000-0000-4000-8000-000000000100'});
    await service.style(actor,quoteId,revisionId,second.attachment.id,3);
    await input('input[placeholder^="全库搜索"]','MEMORY-24');await hasText('本页 1');
    await until(()=>evaluate("document.querySelector('tbody img')?.naturalHeight===96"),'changed portrait decode');
    assert.ok(await evaluate(`revokedObjectURLs.includes(${JSON.stringify(old)})`));
    const changed=await evaluate("document.querySelector('tbody img').src");
    await service.style(actor,quoteId,revisionId,null,4);await input('input[placeholder^="全库搜索"]','');await hasText('本页 25');
    await until(()=>evaluate("Boolean(document.querySelector('tbody tr:first-child [aria-label=未设置款式图]'))"),'unlink placeholder');
    assert.ok(await evaluate(`revokedObjectURLs.includes(${JSON.stringify(changed)})`));await service.style(actor,quoteId,revisionId,first,5);
  });
  await t.test('P2 extreme decode dimensions safely fail without retained browser original',async()=>{
    const pixels=await service.upload(actor,quoteId,revisionId,6,{name:'bomb.png',mimeType:'image/png',kind:'image',bytes:syntheticPNG(100000,100000,0,true),uploadToken:'00000000-0000-4000-8000-000000000102'});
    await service.style(actor,quoteId,revisionId,pixels.attachment.id,7);
    await input('input[placeholder^="全库搜索"]','MEMORY-24');await hasText('本页 1');
    await until(()=>evaluate("Boolean(document.querySelector('tbody [aria-label=款式图不可用]'))"),'decode bound placeholder');
    assert.equal(await evaluate('activeObjectURLs().length'),0);
    assert.equal(requests.filter(r=>r.path.includes(pixels.attachment.id)&&r.path.endsWith('/thumbnail')).length,1);
    assert.equal(requests.filter(r=>r.path.includes(pixels.attachment.id)&&r.path.endsWith('/download')).length,0);
    await service.style(actor,quoteId,revisionId,first,8);
  });
  await t.test('Phone-size genuine JPEG: 4032x3024 >2MiB renders actual small server data',async(t)=>{
    // Browser encoder produces valid synthetic phone-sized JPEGs, not forged headers.
    // One canvas at a time (<50MiB); no real photos or multi-GB allocation.
    for (const [width,height,noisy] of [[4032,3024,true],[2048,1536,true]]) {
      const length=await evaluate(`(()=>{const c=document.createElement('canvas');c.width=${width};c.height=${height};const x=c.getContext('2d');if(${noisy}){const p=x.createImageData(c.width,c.height);let n=7;for(let i=0;i<p.data.length;i+=4){for(let j=0;j<3;j++){n=(Math.imul(n,1664525)+1013904223)>>>0;p.data[i+j]=n>>>24;}p.data[i+3]=255;}x.putImageData(p,0,0);}else{x.fillStyle='#39705e';x.fillRect(0,0,c.width,c.height);}window.qaPhoneJPEG=c.toDataURL('image/jpeg',0.95).split(',')[1];c.width=c.height=0;return qaPhoneJPEG.length})()`);
      // Keep each CDP response bounded; don't send a multi-MB protocol frame.
      assert.ok(length<24*1024*1024);
      let base64='';
      for(let at=0;at<length;at+=65536) base64+=await evaluate(`qaPhoneJPEG.slice(${at},${at+65536})`);
      await evaluate('delete window.qaPhoneJPEG');
      const jpeg=Buffer.from(base64,'base64');
      if(noisy) assert.ok(jpeg.length>2*1024*1024); else assert.ok(jpeg.length<2*1024*1024);
      const latest=await repository.getById(quoteId);
      const photo=await service.upload(actor,quoteId,revisionId,latest.version,{name:'synthetic-phone.jpg',mimeType:'image/jpeg',kind:'image',bytes:jpeg,uploadToken:crypto.randomUUID()});
      await service.style(actor,quoteId,revisionId,photo.attachment.id,latest.version+1);
      const oldURL=await evaluate("document.querySelector('tbody img')?.src??null");
      await input('input[placeholder^="全库搜索"]',width===4032?'MEMORY-24 ':'MEMORY-24  ');
      await hasText('本页 1');
      await until(()=>requests.some(r=>r.path.includes(photo.attachment.id)&&r.path.endsWith('/thumbnail')),'current phone request');
      await until(()=>evaluate(`document.querySelector('tbody img')?.naturalWidth===256&&document.querySelector('tbody img')?.src!==${JSON.stringify(oldURL)}`),'new small server thumbnail displayed');
      const thumb=Buffer.from(await evaluate("fetch(document.querySelector('tbody img').src).then(r=>r.arrayBuffer()).then(b=>Array.from(new Uint8Array(b)))"));
      assert.ok(thumb.length<96*1024&&thumb.length<jpeg.length/100);
      assert.equal(await evaluate("document.querySelector('tbody img').naturalHeight"),192);
      assert.equal(requests.filter(r=>r.path.includes(photo.attachment.id)&&r.path.endsWith('/download')).length,0);
      assert.ok(requests.some(r=>r.path.includes(photo.attachment.id)&&r.path.endsWith('/thumbnail')));
      const original=await service.download(actor,quoteId,revisionId,photo.attachment.id);
      const chunks=[];for await(const chunk of original.stream)chunks.push(chunk);
      assert.equal(Buffer.compare(Buffer.concat(chunks),jpeg),0);
      t.diagnostic(`Synthetic valid JPEG ${width}x${height}, bytes=${jpeg.length} ->256x192, bytes=${thumb.length}, original unchanged`);
      if(width===4032) for(const viewport of [1920,1440,1280,900,390]) await t.test(`large phone thumbnail actual viewport ${viewport}`,async()=>{
        const mobile=viewport===390;
        await command('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1},sessionId);
        await command('Emulation.setEmulatedMedia',{features:[{name:'pointer',value:mobile?'coarse':'fine'},{name:'hover',value:mobile?'none':'hover'}]},sessionId);
        await command('Emulation.setDeviceMetricsOverride',{width:viewport,height:800,deviceScaleFactor:1,mobile},sessionId);
        await until(()=>evaluate("[...document.querySelectorAll('.qc-quote-list-thumbnail img')].some(n=>n.naturalWidth===256&&n.getBoundingClientRect().width>0)"),'visible derivative');
        assert.ok(await evaluate("(()=>{const n=[...document.querySelectorAll('.qc-quote-list-thumbnail img')].find(n=>n.getBoundingClientRect().width>0),r=n.getBoundingClientRect();return n.naturalWidth===256&&n.naturalHeight===192&&r.width<=48&&r.height<=48})()"));
        await bounded();assert.deepEqual(await evaluate('unhandledRejections'),[]);
      });
      await command('Emulation.setTouchEmulationEnabled',{enabled:false},sessionId);
      await command('Emulation.setEmulatedMedia',{features:[{name:'pointer',value:'fine'},{name:'hover',value:'hover'}]},sessionId);
      await command('Emulation.setDeviceMetricsOverride',{width:1280,height:550,deviceScaleFactor:1,mobile:false},sessionId);
      await service.style(actor,quoteId,revisionId,first,latest.version+2);
    }
  });
  await t.test('P2 unavailable image settles to safe placeholder without retry loop',async()=>{
    storage.objects.delete(`attachments/${first}/original`);
    await input('input[placeholder^="全库搜索"]','');await hasText('本页 25');await input('input[placeholder^="全库搜索"]','MEMORY-24');await hasText('本页 1');
    await until(()=>evaluate("Boolean(document.querySelector('tbody [aria-label=款式图不可用]'))"),'missing image placeholder');
    const count=requests.filter(r=>r.path.includes(first)&&r.path.endsWith('/thumbnail')).length;await sleep(300);
    assert.equal(requests.filter(r=>r.path.includes(first)&&r.path.endsWith('/thumbnail')).length,count);assert.equal(await evaluate('activeObjectURLs().length'),0);
    storage.objects.set(`attachments/${first}/original`,bytes);
  });
  await t.test('P2 trusted identity logout revokes live URLs before viewer login',async()=>{
    await input('input[placeholder^="全库搜索"]','');await hasText('本页 25');await scroll(8);await until(()=>decoded(8),'identity baseline visible');
    const before=await evaluate('activeObjectURLs()');
    await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.includes('退出')&&n.textContent.includes('Server')).click()");
    await hasText('登录织序 Server');assert.equal(await evaluate('activeObjectURLs().length'),0);
    assert.ok(await evaluate(`${JSON.stringify(before)}.every(url=>revokedObjectURLs.includes(url))`));
    await input('input[name=username]','synthetic-ui-viewer');await input('input[name=password]','disposable-ui-password');await click('登录 Server');await hasText('本页 25');
    await scroll(0);await until(()=>decoded(0),'viewer fresh permitted bytes');await bounded();
    assert.deepEqual(await evaluate('unhandledRejections'),[]);await isolated();
  });
}
