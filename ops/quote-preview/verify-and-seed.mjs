import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {request} from 'node:https';
import {randomUUID,randomBytes} from 'node:crypto';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]||'');assert.equal(root.toLowerCase(),'d:\\zhixu-local-preview\\d099-18444');
const identity=JSON.parse(readFileSync(join(root,'identity.json'))),project='zhixu-preview-d099-18444';assert.equal(identity.project,project);
const privateValues=JSON.parse(readFileSync(join(root,'private.json'))),ca=readFileSync(join(root,'cert.pem'));
function docker(args,input){try{return execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],timeout:30000}).trim();}catch{throw Error('owned_preview_command_failed');}}
const service=name=>`${project}-${name}-1`;
for(const name of ['database','objects','objects-tls','app','gateway']){const meta=JSON.parse(docker(['inspect','--format','{"project":{{json (index .Config.Labels "com.docker.compose.project")}},"owner":{{json (index .Config.Labels "io.zhixu.owner")}},"ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"image":{{json .Image}}}',service(name)]));assert.equal(meta.project,project);assert.equal(meta.owner,'codex-d-preview');if(['app','gateway','objects-tls'].includes(name))assert.equal(meta.image,identity.imageId);if(name==='gateway')assert.deepEqual(meta.ports,{'8443/tcp':[{HostIp:'127.0.0.1',HostPort:'18444'}]});else assert.ok(!meta.ports||Object.keys(meta.ports).length===0);for(const m of meta.mounts)if(m.Type==='volume')assert.ok(m.Name.startsWith(project+'_'));}
assert.equal(docker(['network','inspect',`${project}_default`,'--format','{{.Internal}}']),'true');
function api(path,{method='GET',body,cookie,origin=true,headers={}}={}){return new Promise((ok,no)=>{const data=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));const req=request(identity.origin+path,{family:4,ca,method,headers:{...(origin?{Origin:identity.origin}:{}),'X-Zhixu-Request':'1',...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json','Content-Length':data.length}:{}),...headers}},res=>{const b=[];res.on('data',x=>b.push(x));res.on('end',()=>ok({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(b),json(){return JSON.parse(this.bytes)}}));});req.on('error',()=>no(Error('preview_https_failed')));req.setTimeout(10000,()=>req.destroy());req.end(data);});}
let checks=0;const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
check((await api('/api/v1/health')).json().database,'ready');check((await api('/build-info.json')).json().gitCommit,identity.commit);check((await api('/api/v1/quotes')).status,401);
const login=await api('/api/v1/auth/login',{method:'POST',body:{username:privateValues.username,password:privateValues.password}});check(login.status,200);assert.match(login.headers['set-cookie'][0],/HttpOnly/);assert.match(login.headers['set-cookie'][0],/Secure/);checks+=2;const cookie=login.headers['set-cookie'][0].split(';')[0];
check((await api('/api/v1/quotes',{method:'POST',body:{},cookie,origin:false})).status,403);
// Bucket initialization is restricted to the isolated object store; secrets stay in its owned process.
const bucketScript=`const {S3Client,CreateBucketCommand}=require('@aws-sdk/client-s3'),fs=require('fs');const c=new S3Client({endpoint:process.env.ZHIXU_ATTACHMENT_S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:fs.readFileSync('/run/secrets/cos-id','utf8'),secretAccessKey:fs.readFileSync('/run/secrets/cos-key','utf8')}});c.send(new CreateBucketCommand({Bucket:'preview-attachments'})).then(()=>console.log('BUCKET_READY')).catch(e=>{if(e.name==='BucketAlreadyOwnedByYou')console.log('BUCKET_READY');else{console.log('BUCKET_FAILED');process.exitCode=1;}}).finally(()=>c.destroy());`;
check(docker(['exec',service('app'),'node','-e',bucketScript]),'BUCKET_READY');
const existing=await api('/api/v1/quotes?limit=100',{cookie});check(existing.status,200);
const marker=join(root,'demo-manifest.json');
if(!readFileSync(join(root,'identity.json'),'utf8').includes('demoSeeded')&&!((existing.json().total||0)>0)){
 const b=await api('/api/v1/quote-masters/brands',{cookie,method:'POST',body:{name:'PREVIEW · 演示品牌'}});check(b.status,201);const brand=b.json().brand;
 const p=await api('/api/v1/quote-masters/customer-salespeople',{cookie,method:'POST',body:{name:'演示客户业务员',brandId:brand.id}});check(p.status,201);const person=p.json().customerSalesperson;const records=[];
 for(let i=0;i<12;i++){
  const create=await api('/api/v1/quotes',{method:'POST',body:{},cookie});check(create.status,201);let record=create.json().quote;const revision=record.quote.revisions[0],pv=revision.priceVersions[0];
  Object.assign(revision.baseInfo,{brandId:brand.id,brandName:brand.name,salespersonId:person.id,salespersonName:person.name,quoteType:i%2?'processing':'distribution',quoteStyleNo:`DEMO-${String(i+1).padStart(3,'0')}`,styleName:['秋季针织上衣 · 合成演示','休闲加工外套 · 合成演示','长袖连衣裙 · 合成演示'][i%3],note:'仅用于 D-099 Preview，非真实业务数据'});
  pv.quantity=String(300+i*100);pv.labor={value:'8.5',description:'合成工价'};pv.pricingParameters.usdCnyRate='7.2';pv.pricingParameters.markupRate='15';
  pv.fabrics=[{id:randomUUID(),lineGroupId:null,independentFields:[],sourceLibraryItemId:null,name:'演示针织主面料',composition:'棉 95% / 氨纶 5%',segmentLengthCm:'125.25',netWidthCm:'150',gsm:'180',lossRate:'3',supplier:'演示面料供应商',unitPrice:'12.75',purchaseUnit:'m'}];
  pv.trims=[{id:randomUUID(),sourceLibraryItemId:null,name:'演示纽扣',specification:'18L',supplier:'演示辅料供应商',usage:'6',unit:'piece',lossRate:'2',unitPrice:'0.25'}];
  const saved=await api(`/api/v1/quotes/${record.quote.id}`,{method:'PUT',cookie,body:{quote:record.quote,expectedVersion:record.version}});check(saved.status,200);record=saved.json().quote;
  const read=await api(`/api/v1/quotes/${record.quote.id}`,{cookie});check(read.status,200);check(read.json().quote.quote.revisions[0].baseInfo.quoteStyleNo,revision.baseInfo.quoteStyleNo);records.push({id:record.quote.id,type:revision.baseInfo.quoteType,styleNo:revision.baseInfo.quoteStyleNo});
 }
 writeFileSync(marker,JSON.stringify({records,seedVersion:1},null,2));identity.demoSeeded=true;writeFileSync(join(root,'identity.json'),JSON.stringify(identity,null,2));
}

const demo=JSON.parse(readFileSync(marker));const quoteId=demo.records[0].id;const current=(await api(`/api/v1/quotes/${quoteId}`,{cookie})).json().quote;const revisionId=current.quote.defaultRevisionId;const path=`/api/v1/quotes/${quoteId}/revisions/${revisionId}/attachments`;const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
if(!demo.attachmentId){const upload=await api(path+'?name=preview-synthetic.png&kind=image',{method:'POST',body:png,cookie,headers:{'Content-Type':'image/png','X-Quote-Version':String(current.version),'Idempotency-Key':randomUUID()}});check(upload.status,201);demo.attachmentId=upload.json().attachment.id;writeFileSync(marker,JSON.stringify(demo,null,2));}
const download=await api(`${path}/${demo.attachmentId}/download`,{cookie});check(download.status,200);check(download.bytes,png);
// Private SQL is restricted to this new Preview database; no real accounts are touched.
const viewerPassword=privateValues.viewerPassword||randomBytes(24).toString('hex');
if(!privateValues.viewerPassword){docker(['exec','-i',service('database'),'psql','-X','-q','-U','quote_preview','-d','quote_preview','-v','ON_ERROR_STOP=1'],`INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES('preview-viewer',crypt('${viewerPassword}',gen_salt('bf',12)),'Preview read-only viewer','viewer',true); INSERT INTO app_roles(id,name) VALUES('preview-viewer-role','Preview read-only'); INSERT INTO app_role_permissions(role_id,permission_key) VALUES('preview-viewer-role','quote.view'); INSERT INTO app_user_roles(user_id,role_id) SELECT id,'preview-viewer-role' FROM app_users WHERE username='preview-viewer';`);privateValues.viewerPassword=viewerPassword;writeFileSync(join(root,'private.json'),JSON.stringify(privateValues));}
const viewerLogin=await api('/api/v1/auth/login',{method:'POST',body:{username:'preview-viewer',password:viewerPassword}});check(viewerLogin.status,200);const viewerCookie=viewerLogin.headers['set-cookie'][0].split(';')[0];check((await api('/api/v1/quotes',{cookie:viewerCookie})).status,200);check((await api('/api/v1/quotes',{method:'POST',body:{},cookie:viewerCookie})).status,403);
check((await api('/api/v1/auth/logout',{method:'POST',body:{},cookie:viewerCookie})).status,200);check((await api('/api/v1/auth/logout',{method:'POST',body:{},cookie})).status,200);check((await api('/api/v1/quotes',{cookie})).status,401);
writeFileSync(join(root,'api-verification.json'),JSON.stringify({checks,result:'PASS',acceptance:'USER ACCEPTANCE PENDING',verifiedAt:new Date().toISOString()},null,2));console.log(JSON.stringify({project,checks,result:'PASS',origin:identity.origin,acceptance:'USER ACCEPTANCE PENDING'}));
