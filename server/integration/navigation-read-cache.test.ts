import test from "node:test";
import assert from "node:assert/strict";
import { createQuoteMasterServerClient } from "../../features/basic-settings/server/quote-master-server-client";
import { createServerQuoteMasterDependencies } from "../../features/basic-settings/server/quote-master-dependencies";
import { setSessionReadScope, clearSessionReads } from "../../features/server-auth/session-read-cache";
import { createQuoteServerClient } from "../../features/quote-center/server/quote-server-client";
import { createSalesOrderServerClient } from "../../features/order-center/server/sales-order-server-client";

test("real master adapters share seven reads instead of seventeen and invalidate after writes", async()=>{
 setSessionReadScope("synthetic:all");const paths:string[]=[];
 const client=createQuoteMasterServerClient({applicationCache:true,fetchImpl:(async(url,init)=>{
  const path=String(url);paths.push(path);
  if(init?.method==="POST")return Response.json({trim:{id:"synthetic"}});
  return Response.json({brands:[],customerSalespeople:[],fabrics:[],trims:[],settings:null,suppliers:[],manufacturingPresets:[]});
 }) as typeof fetch});
 const dependencies=createServerQuoteMasterDependencies(["quote.view","settings.trim.edit"],client);
 await dependencies.load();assert.equal(paths.length,7);assert.equal(new Set(paths).size,7);
 await dependencies.load();assert.equal(paths.length,7);
 await client.createTrim({name:"Synthetic",specification:"",supplier:"",unit:"个",defaultLossRate:null,unitPrice:null});
 await dependencies.load();assert.equal(paths.length,15);
 setSessionReadScope(null);
});
test("quote and order preload uses the exact query once; subsequent visits revalidate",async()=>{
 setSessionReadScope("synthetic:reader");let quotes=0,orders=0;
 const q=createQuoteServerClient({applicationCache:true,fetchImpl:(async()=>{quotes++;return Response.json({quotes:[],page:{limit:25,offset:0,count:0,total:0}});}) as typeof fetch});
 const o=createSalesOrderServerClient({applicationCache:true,fetchImpl:(async()=>{orders++;return Response.json({salesOrders:[],page:{limit:50,offset:0,total:0,hasMore:false}});}) as typeof fetch});
 const query={limit:25,offset:0};await q.list(query,{preload:true});await q.list(query);assert.equal(quotes,1);await q.list(query);assert.equal(quotes,2);
 await o.list({limit:50},{preload:true});await o.list({limit:50});assert.equal(orders,1);await o.list({limit:50});assert.equal(orders,2);
 clearSessionReads();await q.list(query);assert.equal(quotes,3);setSessionReadScope(null);
});
