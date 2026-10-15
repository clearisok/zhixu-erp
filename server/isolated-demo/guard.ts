import { createHash } from "node:crypto";
export type DemoManifest={version:1;project:string;sourceSha:string;buildId:string;buildTime:string;owner:string;database:string;user:string;databasePassword:string;port:number;workbookHash:string;workbookPayloadHash:string;fixtureOnly:true};
export function validateDemoManifest(m:DemoManifest,env:Readonly<Record<string,string|undefined>>={}) {
 if(m.version!==1||m.fixtureOnly!==true||!/^zhixu-local-[a-f0-9]{12}$/.test(m.project)||!/^demo_[a-f0-9]{12}$/.test(m.database)||m.database!==m.user||!/^sha256:[a-f0-9]{64}$/.test(m.owner)||!/^([a-f0-9]{40})$/.test(m.sourceSha)||!/^([a-f0-9]{64})$/.test(m.workbookHash)||!/^([a-f0-9]{64})$/.test(m.workbookPayloadHash)||m.databasePassword.length<32||!Number.isInteger(m.port)||m.port<62000||m.port>63999)throw Error('isolated_manifest_invalid');
 if(Object.keys(env).some(k=>/^(DATABASE_URL|DB_|AINUOKE_)/.test(k)||/ZHIXU_(ADMIN_|AINUOKE_(SOURCE_KEY|SOURCE_MAX|BASE|USERNAME|PASSWORD|APPROVED_HTTP))/.test(k)))throw Error('inherited_database_or_source_configuration');
 return m;
}
export function assertDatabaseOwnership(identity:{database:string;user:string;tables:number;marker?:{owner:string;source_sha:string;workbook_hash:string;state:string}},m:DemoManifest){
 if(identity.database!==m.database||identity.user!==m.user)throw Error('isolated_database_identity_mismatch');
 if(identity.marker){if(identity.marker.owner!==m.owner||identity.marker.source_sha!==m.sourceSha||identity.marker.workbook_hash!==m.workbookPayloadHash||identity.marker.state!=='ready')throw Error('isolated_database_marker_mismatch');return 'resume' as const;}
 if(identity.tables!==0)throw Error('isolated_database_not_empty');return 'initialize' as const;
}
export const ownerHash=(v:string)=>'sha256:'+createHash('sha256').update(v).digest('hex');