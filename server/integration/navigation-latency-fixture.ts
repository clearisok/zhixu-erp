// Synthetic, GET-only, loopback fixture. No database, credentials or source calls.
import {createServer} from "node:http";
import {resolve} from "node:path";
import {appendFile, mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {serveStatic} from "../static-files";
import {PERMISSION_KEYS} from "../../features/permissions/model/permissions";
const root=resolve(process.argv[2]??"dist/client"), log=resolve(process.argv[3]??"outputs/navigation-latency/fixture.jsonl");
await mkdir(resolve(log,".."),{recursive:true});
const image=await sharp({create:{width:64,height:64,channels:3,background:"#165c50"}}).jpeg().toBuffer();
const sha=createHash("sha256").update(image).digest("hex");
const date="2026-11-05T00:00:00.000Z";
const server=createServer(async(req,res)=>{
 const path=new URL(req.url??"/","http://local").pathname,start=performance.now();
 if(req.method!=="GET"){res.writeHead(405);res.end();return;}
 const measured=path.endsWith(".rsc")||path.startsWith("/api/");
 if(measured){res.once("finish",()=>void appendFile(log,JSON.stringify({path,start,end:performance.now(),status:res.statusCode})+"\n"));await new Promise(r=>setTimeout(r,300));}
 const json=(value:unknown)=>{res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(value));};
 if(path==="/api/v1/auth/me")return json({user:{id:"synthetic-perf",username:"synthetic-perf",name:"合成性能验收"}});
 if(path==="/api/v1/auth/permissions")return json({permissions:PERMISSION_KEYS});
 if(path==="/api/v1/quotes")return json({quotes:[{id:"synthetic-quote",quoteCode:"QT-PERF",defaultRevisionId:"synthetic-revision",version:1,styleImage:{attachmentId:"synthetic-image",mimeType:"image/jpeg",byteSize:image.length,sha256:sha},summary:{quoteStyleNo:"PERF-QUOTE",styleName:"合成性能验收",brandName:"",salespersonName:"",status:"draft",quoteType:"distribution",quoteDate:null,revisionLabel:"V1",priceVersionCount:1}}],page:{limit:25,offset:0,count:1,total:1}});
 if(path.endsWith("/thumbnail")){res.writeHead(200,{"Content-Type":"image/jpeg","Content-Length":image.length,"X-Thumbnail-SHA256":sha,"Cache-Control":"no-store"});res.end(image);return;}
 if(path==="/api/v1/sales-orders")return json({salesOrders:[{id:"synthetic-order",version:1,orderNo:"SO-PERF",creationSource:"quote",lifecycleState:"draft",salesContractNo:null,insideOrderNo:null,styleNo:"PERF-ORDER",companyName:"合成",customerName:"",brandName:"",quantity:100,colorCount:1,sourceLifecycleStatus:"draft",contractDate:null,contractDeliveryDate:"2026-11-30",createdAt:date,updatedAt:date}],page:{limit:50,offset:0,total:1,hasMore:false}});
 if(path==="/api/v1/quote-masters/trims")return json({trims:[{id:"synthetic-trim",name:"PERF-TRIM",version:1,createdAt:date,updatedAt:date,specification:"",supplier:"合成供应商",unit:"个",defaultLossRate:null,unitPrice:null}]});
 if(path==="/api/v1/quote-settings")return json({settings:null});
 if(path==="/api/v1/quote-masters/supplier-suggestions")return json({suppliers:["合成供应商"]});
 if(path.startsWith("/api/")){res.writeHead(404);res.end();return;}
 if(!await serveStatic(req,res,root)){res.writeHead(404);res.end();}
});
server.listen(0,"127.0.0.1",()=>console.log(JSON.stringify({syntheticOnly:true,url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,delayMs:300})));
