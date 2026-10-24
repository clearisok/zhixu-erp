// Runs only in the reviewed image with exact local S3 endpoint + private file keys.
// No credential/SDK error output. Init is explicit; normal readiness is read-only.
import { isLocalObjectEndpoint } from './local-objects.mjs';
const {loadServerConfig}=await import('/app/dist/server/server/config.js');
const {S3Client,HeadBucketCommand,CreateBucketCommand}=await import('/app/node_modules/@aws-sdk/client-s3/dist-cjs/index.js');
let client;
try {
  const [action,ack]=process.argv.slice(2);
  if(!['check','init'].includes(action)||(action==='init'&&ack!=='--execute'))throw Error();
  const config=loadServerConfig().attachmentStorage;
  if(config.kind!=='s3'||!isLocalObjectEndpoint(config.endpoint)||!config.forcePathStyle||process.env.NODE_EXTRA_CA_CERTS!=='/run/tls/ca.pem'||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error();
  client=new S3Client({endpoint:config.endpoint,region:config.region,forcePathStyle:true,
    credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:1,
    requestHandler:{connectionTimeout:2500,requestTimeout:5000,throwOnRequestTimeout:true}});
  const send=command=>client.send(command,{abortSignal:AbortSignal.timeout(6000)});
  try { await send(new HeadBucketCommand({Bucket:config.bucket})); }
  catch(e) {
    if(action!=='init'||e?.$metadata?.httpStatusCode!==404)throw Error();
    await send(new CreateBucketCommand({Bucket:config.bucket}));
    await send(new HeadBucketCommand({Bucket:config.bucket}));
  }
  console.log(JSON.stringify({localObjectStorage:'READY',operation:action}));
} catch { console.error('local_object_storage_not_ready');process.exitCode=1; }
finally { client?.destroy(); }
