import {startSourceDeletedDemo} from '../server/integration/source-deleted-demo-fixture.js';
import {readFile} from 'node:fs/promises';
const build=JSON.parse(await readFile('dist/client/build-info.json','utf8'));
if(build.quoteAuthority!=='server'||build.orderRead!=='snapshot'||build.identityMode!=='session')throw Error('source-deleted demo requires an explicit Server/snapshot/session UI build');
const demo=await startSourceDeletedDemo();
await demo.confirmDeleted();
process.stdout.write(JSON.stringify({origin:'ISOLATED_SYNTHETIC_DEMO',url:demo.base+'/order-center',
 username:demo.admin,password:demo.password,build,stagingAccess:false,realAinuokeRequests:0})+'\n');
setTimeout(()=>{void demo.close().then(()=>process.exit(0));},2*60*60*1000).unref();
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void demo.close().then(()=>process.exit(0));});
