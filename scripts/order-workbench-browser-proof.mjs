/** Checks the actual local ERP UI against its GET responses. No credentials or business writes. */
import { spawn } from 'node:child_process';
import { writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { waitForChromiumEndpoint, stopOwnedChromium } from '../server/integration/chromium-endpoint.mjs';
const url = new URL(process.argv[2]);
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/order-center/server-detail' || !/^[a-f0-9-]{36}$/u.test(url.searchParams.get('id') ?? '')) throw Error('explicit_local_order_url_required');
const output = resolve(process.argv[3] ?? 'outputs/order-workbench/real-proof'); await mkdir(output, { recursive: true });
const build = await (await fetch(url.origin + '/build-info.json')).json();
const reply = await fetch(url.origin + '/api/v1/sales-orders/' + url.searchParams.get('id'));
if (!reply.ok) throw Error('live_order_unavailable');
const { salesOrder: order } = await reply.json();
const pause = ms => new Promise(done => setTimeout(done, ms));
const profile = join(await mkdtemp(join(tmpdir(), 'zhixu-workbench-proof-')), 'profile');
let browser, socket, session, sequence = 0; const pending = new Map(), exceptions = [], requests = [], responses = [], checks = [];
const command = (method, params = {}, sid = session) => new Promise((done, reject) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 20000);
  pending.set(id, { done: row => { clearTimeout(timer); done(row); }, reject: error => { clearTimeout(timer); reject(error); } });
  socket.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
});
try {
  browser = spawn(process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome'), ['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir=' + profile,'about:blank'], { stdio:'ignore', windowsHide:true });
  const [port, path] = await waitForChromiumEndpoint(profile);
  socket = new WebSocket('ws://127.0.0.1:' + port + path);
  await new Promise((done, reject) => { socket.addEventListener('open',done,{once:true});socket.addEventListener('error',reject,{once:true}); });
  socket.addEventListener('message', event => {
    const row = JSON.parse(String(event.data)), job = pending.get(row.id);
    if (job) { pending.delete(row.id); if (row.error) job.reject(Error(row.error.message)); else job.done(row.result); }
    if (row.method === 'Runtime.exceptionThrown') exceptions.push(row.params.exceptionDetails.text);
    if (row.method === 'Network.requestWillBeSent' && row.params.request.url.startsWith(url.origin + '/api/v1/')) requests.push({ method: row.params.request.method, path: new URL(row.params.request.url).pathname });
    if (row.method === 'Network.responseReceived' && row.params.response.url.startsWith(url.origin + '/api/v1/')) responses.push({ status: row.params.response.status, path: new URL(row.params.response.url).pathname });
  });
  const target = await command('Target.createTarget',{url:'about:blank'},null);
  session = (await command('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  const evaluate = async expression => { const row = await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(row.exceptionDetails)throw Error('DOM not ready');return row.result.value; };
  const until = async (read,label) => { for(let i=0;i<400;i++){try{if(await read())return;}catch{}await pause(100);}throw Error(label+' timed out'); };
  const check = (name,pass) => { checks.push({name,pass});if(!pass)throw Error(name); };
  const capture = async name => { const row=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(row.data,'base64')); };
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:url.href});
  await until(async()=>await evaluate('Boolean(document.querySelector("[data-order-workbench]"))'),'workspace');
  await until(async()=>!(await evaluate('document.body.innerText')).match(/读取生产执行|读取关账安排|读取物料来源/u),'execution reads');
  const header=await evaluate('document.querySelector(".ow-order-heading").innerText');
  check('real order identity',header.includes(order.insideOrderNo||order.styleNo)&&header.includes(order.orderNo));
  check('real source quantity',header.includes(order.quantity===null?'暂未取得数据':order.quantity.toLocaleString('zh-CN')));
  await capture('overview-1440');
  for(const [width,ratio,mobile] of [[1920,1,false],[1536,1.25,false],[1280,1,false],[900,1,false],[390,1,true],[320,1,true]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:ratio,mobile});
    await command('Emulation.setTouchEmulationEnabled',{enabled:mobile});await pause(200);
    for(const label of ['订单总览','颜色与尺码','价格与历史']){
      await evaluate(`(()=>{const e=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent===${JSON.stringify(label)});e.click();})()`);
      await pause(120);await evaluate("document.querySelector('.ops-workspace').scrollTop=0");
      check(label+' width '+width,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      check(label+' cards reachable '+width,await evaluate(`[...document.querySelectorAll('.ow-workbench [role=tabpanel]:not([hidden]) .oc-server-detail-section')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})`));
      if(width===390)await capture(label==='订单总览'?'overview-390':label==='颜色与尺码'?'colors-390':'prices-390');
    }
  }
  await evaluate("[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent==='颜色与尺码').click()");await pause(150);
  const geometry=await evaluate(`(()=>{const h=document.querySelector('#ow-panel-colors header h2'),th=document.querySelector('.ow-size-matrix th'),r=h.getBoundingClientRect(),s=getComputedStyle(h);return{heading:{text:h.textContent,x:r.x,y:r.y,width:r.width,height:r.height,color:s.color,font:s.fontSize,visibility:s.visibility},cellFont:th?getComputedStyle(th).fontSize:null}})()`);
  check('matrix heading reachable at 320',geometry.heading.x>=0&&geometry.heading.x+geometry.heading.width<=320);
  check('matrix font readable',geometry.cellFont===null||parseFloat(geometry.cellFont)>=12);
  check('no browser business writes',requests.every(row=>row.method==='GET'));
  check('no browser exceptions',exceptions.length===0);
  const proof={sourceSha:build.gitCommit,buildId:build.buildId,observedAt:new Date().toISOString(),order:{id:order.id,orderNo:order.orderNo,insideOrderNo:order.insideOrderNo,quantity:order.quantity,colorCount:order.colors.length},checks,geometry,exceptions,responses,mutationsForwarded:0,scope:'actual built ERP and existing authenticated GET APIs; local read-only demo; not deployed'};
  await writeFile(join(output,'proof.json'),JSON.stringify(proof,null,2));
  console.log(JSON.stringify({sourceSha:build.gitCommit,orderId:order.id,checks,geometry,unavailable:responses.filter(row=>row.status!==200)}));
}finally{
  if(browser)await stopOwnedChromium(browser,{gracefulClose:socket?()=>command('Browser.close',{},null):undefined});
  if(socket)socket.close();
}
