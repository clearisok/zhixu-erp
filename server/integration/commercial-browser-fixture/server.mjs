import { createServer as createViteServer } from "vite";
import { createServer } from "node:http";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export async function startCommercialOrderBrowser(api){
 if(new URL(api).hostname!=="127.0.0.1")throw Error("Disposable loopback API required");
 const root=fileURLToPath(new URL("./",import.meta.url)),workspace=resolve(root,"../../.."),http=createServer();
 const vite=await createViteServer({configFile:false,root,plugins:[react()],logLevel:"warn",resolve:{alias:{"@":workspace,"next/navigation":resolve(root,"navigation.ts")}},define:{__ZHIXU_BUILD_INFO__:JSON.stringify({quoteAuthority:"server",identityMode:"session",masterSettingsAuthority:"server",quoteWriterMode:"writable"})},server:{middlewareMode:true,hmr:{server:http},proxy:{"/api":{target:api}},fs:{allow:[workspace]}}});
 http.on("request",vite.middlewares);await new Promise(done=>http.listen(0,"127.0.0.1",done));
 return{url:"http://127.0.0.1:"+http.address().port,close:async()=>{await vite.close();await new Promise(done=>http.close(done));}};
}
