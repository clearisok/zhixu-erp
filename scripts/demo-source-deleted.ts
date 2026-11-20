import {startSourceDeletedDemo} from '../server/integration/source-deleted-demo-fixture.js';
const demo=await startSourceDeletedDemo();
await demo.confirmDeleted();
process.stdout.write(JSON.stringify({origin:'ISOLATED_SYNTHETIC_DEMO',url:demo.base+'/order-center',
 username:demo.admin,password:demo.password,stagingAccess:false,realAinuokeRequests:0})+'\n');
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void demo.close().then(()=>process.exit(0));});
