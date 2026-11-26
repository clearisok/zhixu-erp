import type {PoolClient} from 'pg';
import type {AinuokeOrderDiscoveryQuery,AinuokeSalesContractQuery,AinuokeReportSnapshot} from '../../features/ainuoke-api/model/ainuoke-api.js';
import {saveSharedPages,supportsSharedContent} from './shared-content.js';
import {saveCatalogEvidence} from './catalog-evidence.js';
import {auditDirectoryEvidence} from './sync-audit.js';
import type {SourceOperationEvidence} from '../operation-logs/repository.js';

/** The caller has already validated both passes, account, contract, mapper and business locks. */
export async function saveManualColorEvidence(c:PoolClient,scope:{sourceKey:string;accountFingerprint:string;sourceId:string;contract:string},
 raw:{discoveryBefore:AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];discoveryAfter:AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];colors:Record<string,AinuokeReportSnapshot<AinuokeSalesContractQuery>[]>}):Promise<SourceOperationEvidence|null>{
 if(!await supportsSharedContent(c))return null;
 const color=await saveSharedPages(c,{...scope,kind:'colors'},raw.colors[scope.contract]);
 const captureId=await saveCatalogEvidence(c,scope.sourceKey,scope.accountFingerprint,{schemaVersion:'ainuoke-order-addition-discovery.v1',discoveryBefore:raw.discoveryBefore,discoveryAfter:raw.discoveryAfter});
 await auditDirectoryEvidence(c,captureId);
 return {colorContentId:color.contentId,captureId};
}
