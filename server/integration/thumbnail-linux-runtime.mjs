import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

// Immutable candidate only; no mounts, ports, credentials or network. Exercises the
// compiled worker in the real npm-ci --ignore-scripts Node22 Alpine image.
const [image,source]=process.argv.slice(2);
assert.match(image??'',/^sha256:[0-9a-f]{64}$/);
assert.match(source??'',/^[0-9a-f]{40}$/);
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:120000,stdio:['pipe','pipe','pipe']}).trim();
try {
  assert.equal(run(['image','inspect',image,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}']),source);
  const program=`
import assert from 'node:assert/strict';import sharp from 'sharp';import{Readable}from'node:stream';import{createHash}from'node:crypto';
import{generateThumbnail}from'./dist/server/server/attachments/thumbnail.js';
assert.equal(process.platform,'linux');assert.equal(process.versions.node.split('.')[0],'22');
const raw=Buffer.alloc(4032*3024*3);let n=7;for(let i=0;i<raw.length;i++){n=(Math.imul(n,1664525)+1013904223)>>>0;raw[i]=n>>>24;}
const source=await sharp(raw,{raw:{width:4032,height:3024,channels:3}}).jpeg({quality:92}).toBuffer();
const hash=b=>createHash('sha256').update(b).digest('hex'),before=hash(source);
assert.ok(source.length>2097152);
const thumb=await generateThumbnail({size:source.length,sha256:before},async()=>Readable.from(source));
const m=await sharp(thumb.bytes).metadata();assert.deepEqual([m.width,m.height],[256,192]);assert.ok(thumb.bytes.length<98304);assert.equal(hash(source),before);
for(const format of ['png','webp']){const b=await sharp({create:{width:600,height:300,channels:4,background:'#39705e88'}}).withMetadata({orientation:6}).toFormat(format).toBuffer();const r=await generateThumbnail({size:b.length,sha256:hash(b)},async()=>Readable.from(b));const x=await sharp(r.bytes).metadata();assert.deepEqual([x.width,x.height],[128,256]);}
const c=new AbortController();let destroyed=false;const p=generateThumbnail({size:1,sha256:'0'.repeat(64)},async()=>new Readable({read(){},destroy(e,done){destroyed=true;done();}}),c.signal);setTimeout(()=>c.abort(),30);await assert.rejects(p);assert.equal(destroyed,true);
console.log(JSON.stringify({result:'LINUX_THUMBNAIL_PASS',node:process.versions.node,sharp:sharp.versions.sharp,vips:sharp.versions.vips,sourceBytes:source.length,sourceSHA:before,width:m.width,height:m.height,thumbnailBytes:thumb.bytes.length,thumbnailSHA:thumb.sha256,originalPreserved:true,formats:['jpeg','png','webp'],orientation:true,cancel:true,network:'none',mounts:0,readOnly:true}));`;
  console.log(run(['run','--rm','-i','--network','none','--read-only','--memory','768m','--cpus','2','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges',image,'node','--input-type=module'],program));
} catch {console.error('LINUX_THUMBNAIL_BLOCKED');process.exitCode=1;}
