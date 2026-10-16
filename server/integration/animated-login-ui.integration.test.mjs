import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.ts";
import { bootstrapAdmin } from "../auth/bootstrap.ts";
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,label){for(let i=0;i<150;i++){if(await read())return;await wait(100);}throw Error(label+" timed out");}
test("Animated login: real session, redirects, keyboard, errors and responsive UI",{timeout:180000},async t=>{
 const build=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));
 assert.equal(build.quoteAuthority,"server");assert.equal(build.identityMode,"session");
 const x=await startCommercialSecurityFixture(resolve("dist/client"));t.after(x.close);
 const password="Synthetic-UI-Only-2026";
 await bootstrapAdmin(x.pool,{username:"synthetic.ui.root",displayName:"合成管理员",password});
 const temp=await mkdtemp(join(tmpdir(),"zhixu-login-ui-"));let browser,ws,session,id=0;const pending=new Map(),errors=[];
 try{
  const profile=join(temp,"profile");
  browser=spawn(process.env.CHROME_PATH??(process.platform==="win32"?"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe":"google-chrome"),["--headless=new","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:"ignore",windowsHide:true});
  await until(()=>existsSync(join(profile,"DevToolsActivePort")),"Chromium");
  const [port,path]=readFileSync(join(profile,"DevToolsActivePort"),"utf8").trim().split(/\r?\n/);
  ws=new WebSocket("ws://127.0.0.1:"+port+path);await new Promise((done,reject)=>{ws.addEventListener("open",done,{once:true});ws.addEventListener("error",reject,{once:true});});
  const command=(method,params={},sid=session)=>new Promise((done,reject)=>{pending.set(++id,{done,reject});ws.send(JSON.stringify({id,method,params,sessionId:sid}));});
  ws.addEventListener("message",({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(p){pending.delete(r.id);if(r.error)p.reject(Error(JSON.stringify(r.error)));else p.done(r.result);}if(r.method==="Runtime.exceptionThrown")errors.push(r.params.exceptionDetails.text);});
  const target=await command("Target.createTarget",{url:"about:blank"},undefined);
  session=(await command("Target.attachToTarget",{targetId:target.targetId,flatten:true},undefined)).sessionId;
  await command("Page.enable");await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const evalJs=async expression=>{const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});assert.equal(r.exceptionDetails,undefined,JSON.stringify(r.exceptionDetails));return r.result.value;};
  await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.authCalls=0;const original=fetch;window.fetch=(...a)=>{if(String(a[0])==='/api/v1/auth/logout'&&window.logoutFail)return Promise.reject(Error('synthetic logout failure'));if(String(a[0])==='/api/v1/auth/me'&&window.restoreFail)return Promise.resolve(new Response('{}',{status:503}));if(String(a[0])==='/api/v1/auth/login'){authCalls++;if(window.authMode==='hold')return new Promise(done=>window.releaseAuth=()=>done(new Response(JSON.stringify({error:{code:'login_rate_limited'}}),{status:429})));if(window.authMode==='network')return Promise.reject(Error('synthetic network failure'));}return original(...a);};"});
  const body=()=>evalJs("document.body?.innerText??''");
  const has=async value=>{try{await until(async()=>(await body()).includes(value),value);}catch(error){throw Error(error.message+"; "+await body());}};
  const navigate=async path=>{const epoch=Date.now()+Math.random();await evalJs("window.navigationEpoch="+epoch);await command("Page.navigate",{url:x.base+path});await until(()=>evalJs("window.navigationEpoch!=="+epoch+" && document.readyState==='complete'"),"navigation");};
  const input=(selector,value)=>evalJs("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");if(!n)throw Error('missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+JSON.stringify(value)+");n.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const click=label=>evalJs("(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')??n.textContent.trim())==="+JSON.stringify(label)+"&&!n.disabled&&n.getClientRects().length);if(!n)throw Error('missing button '+ "+JSON.stringify(label)+");n.click()})()");
  const shot=async name=>{if(process.env.LOGIN_EVIDENCE!=="1")return;const dir=resolve("docs/tasks/active/evidence/animated-login");await mkdir(dir,{recursive:true});const r=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(dir,name+".png"),Buffer.from(r.data,"base64"));};

  const ready=async()=>{await has("欢迎回来");await until(()=>evalJs("document.querySelector('input[name=username]')!==null"),"login form");};
  const login=async()=>{await input("input[name=username]","synthetic.ui.root");await input("input[name=password]",password);await click("登录织序");};
  await t.test("direct protected deep-link redirects to public login without loading business data",async()=>{
   await navigate("/quote-center?source=synthetic#resume");await ready();
   assert.equal(await evalJs("location.pathname"),"/login");
   assert.equal(await evalJs("new URLSearchParams(location.search).get('returnTo')"),"/quote-center?source=synthetic#resume");
   assert.equal((await fetch(x.base+"/api/v1/quotes")).status,401);
   assert.equal(await evalJs("document.querySelector('.qc-app-shell')!==null"),false);
  });
  await t.test("actual CSS and form remain usable at desktop, tablet and small mobile sizes",async()=>{
   for(const [width,height] of [[1440,900],[1024,800],[768,900],[390,844],[320,740]]){
    await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<761});
    await wait(750);
    assert.equal(await evalJs("document.documentElement.scrollWidth>innerWidth+1"),false);
    assert.equal(await evalJs("getComputedStyle(document.querySelector('.zx-login')).display"),"grid");
    assert.equal(await evalJs("getComputedStyle(document.querySelector('.zx-login-submit')).backgroundColor"),"rgb(37, 69, 173)");
    assert.ok(await evalJs("[...document.querySelectorAll('.zx-login-form input,.zx-login-form button')].every(n=>n.getBoundingClientRect().height>=44)"));
    await shot("login-"+width);
   }
  });
  await t.test("keyboard, password visibility, privacy reaction and reduced motion",async()=>{
   await command("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
   assert.equal(await evalJs("document.querySelectorAll('.zx-login-friend').length"),4);
   await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:1300,y:200});
   await until(()=>evalJs("parseFloat(document.querySelector('.zx-login').style.getPropertyValue('--look-x'))>0"),"eyes follow pointer");
   await evalJs("document.querySelector('input[name=username]').focus()");
   assert.equal(await evalJs("document.querySelector('.zx-login').dataset.typing"),"true");
   await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
   await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
   assert.equal(await evalJs("document.activeElement.name"),"password");
   assert.equal(await evalJs("document.querySelector('.zx-login').dataset.privacy"),"true");
   await input("input[name=password]","Synthetic-Wrong-Password");
   await click("显示密码");assert.equal(await evalJs("document.querySelector('input[name=password]').type"),"text");
   assert.equal(await evalJs("document.querySelector('.zx-login').dataset.privacy"),"true");
   assert.equal(await evalJs("getComputedStyle(document.querySelector('.zx-login-friend-tall .zx-login-eye')).animationName"),"zx-login-peek");
   await click("隐藏密码");
   await command("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
   assert.equal(await evalJs("getComputedStyle(document.querySelector('.zx-login-friend')).animationName"),"none");
   assert.equal(await evalJs("getComputedStyle(document.querySelector('.zx-login-eye')).animationName"),"none");
   await shot("login-password");
   await command("Emulation.setEmulatedMedia",{features:[]});
  });
  await t.test("real wrong password keeps login, clears password and focuses accessible error",async()=>{
   await input("input[name=username]","synthetic.ui.root");
   await evalJs("document.querySelector('input[name=password]').focus()");
   await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r",unmodifiedText:"\r"});
   await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
   await has("用户名或密码不正确");
   assert.equal(await evalJs("document.querySelector('input[name=password]').value"),"");
   assert.equal(await evalJs("document.activeElement.getAttribute('role')"),"alert");
   assert.equal(await evalJs("location.pathname"),"/login");await shot("login-error");
  });
  await t.test("pending duplicate submit, rate limit and network failure never fake success",async()=>{
   await evalJs("window.authCalls=0;window.authMode='hold'");
   await input("input[name=password]",password);
   await evalJs("document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit()");
   await until(()=>evalJs("Boolean(window.releaseAuth)"),"pending request");
   assert.equal(await evalJs("authCalls"),1);
   assert.equal(await evalJs("document.querySelector('input[name=username]').disabled"),true);
   await evalJs("releaseAuth()");await has("登录尝试有些频繁");
   await evalJs("window.authMode='network'");await input("input[name=password]",password);await click("登录织序");await has("检查网络后重试");
   assert.equal(await evalJs("location.pathname"),"/login");
   await evalJs("window.authMode='normal'");
  });
  await t.test("real login preserves internal query/hash, secrets never enter web storage",async()=>{
   await login();await has("新建报价");
   assert.equal(await evalJs("location.pathname+location.search+location.hash"),"/quote-center?source=synthetic#resume");
   assert.equal(await evalJs("JSON.stringify([localStorage,sessionStorage]).includes("+JSON.stringify(password)+")"),false);
   assert.equal(await evalJs("document.cookie.includes('session')"),false);
   const cookies=(await command("Network.getCookies")).cookies;
   assert.ok(cookies.some(c=>c.httpOnly),"session is HttpOnly");
   assert.equal(await evalJs("Object.keys(localStorage).some(k=>k.includes('zhixu.erp.local.'))"),false);
  });
  await t.test("authenticated login avoids a loop and rejects external return URL",async()=>{
   await navigate("/login?returnTo="+encodeURIComponent("https://evil.invalid"));await has("新建报价");
   assert.equal(await evalJs("location.origin"),x.base);assert.equal(await evalJs("location.pathname"),"/quote-center");
   await navigate("/login?returnTo="+encodeURIComponent("/login"));await has("新建报价");
   assert.equal(await evalJs("location.pathname"),"/quote-center");
  });
  await t.test("logout and reload return to formal login; unsupported modules stay closed",async()=>{
   await evalJs("window.logoutFail=true");await click("用户菜单");await has("退出登录");await click("退出登录");await has("退出未完成");
   assert.equal(await evalJs("location.pathname"),"/quote-center");
   await evalJs("window.logoutFail=false");await click("退出登录");await ready();assert.equal(await evalJs("location.pathname"),"/login");
   await navigate("/login");await ready();
   await navigate("/production-scheduling");await has("尚未接通");
   assert.equal(await evalJs("document.querySelector('.zx-login-form')!==null"),false);
   await navigate("/login");await ready();
  });
  await t.test("session restore failure shows retry without credentials form, then recovers",async()=>{
   const hook=await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.restoreFail=true;"});
   await navigate("/login");await has("暂时无法确认登录状态");
   assert.equal(await evalJs("document.querySelector('input[name=password]')===null"),true);
   await command("Page.removeScriptToEvaluateOnNewDocument",{identifier:hook.identifier});
   await evalJs("window.restoreFail=false");await click("重新连接");await ready();
  });
  assert.deepEqual(errors,[]);assert.deepEqual(x.errors,[]);
 }finally{
  ws?.close();if(browser&&browser.exitCode===null&&browser.signalCode===null){
   const closed=new Promise(done=>browser.once("close",done));browser.kill();
   await Promise.race([closed,wait(3000)]);
  }
  const distance=relative(resolve(tmpdir()),resolve(temp));
  assert.ok(distance&&!distance.startsWith("..")&&!isAbsolute(distance)&&temp.includes("zhixu-login-ui-"));
  await rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 }
});
