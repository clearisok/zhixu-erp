import {createServer as createViteServer} from 'vite';
import {createServer as createHttpServer} from 'node:http';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export async function startOrderIntegrationPreview(api) {
  if(new URL(api).hostname!=='127.0.0.1')throw new Error('Only disposable loopback API');
  const root=fileURLToPath(new URL('./',import.meta.url));const workspace=resolve(root,'../../..');const http=createHttpServer();
  const vite=await createViteServer({configFile:false,root,plugins:[react()],logLevel:'warn',resolve:{alias:{'@':workspace,'next/navigation':resolve(root,'navigation.ts'),'next/link':resolve(root,'link.tsx')}},define:{__ZHIXU_BUILD_INFO__:JSON.stringify({quoteAuthority:'server',identityMode:'session',masterSettingsAuthority:'server'})},server:{middlewareMode:true,hmr:{server:http},proxy:{'/api':{target:api}},fs:{allow:[workspace]}}});
  http.on('request',vite.middlewares);await new Promise(done=>http.listen(0,'127.0.0.1',done));const address=http.address();
  return {url:`http://127.0.0.1:${address.port}/order-center`,close:async()=>{await vite.close();await new Promise(done=>http.close(done));}};
}
