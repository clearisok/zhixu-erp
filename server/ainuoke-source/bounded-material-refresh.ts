import type { Pool } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { selectContracts, requireAdditionProfile } from './additions.js';
import { accountFingerprint, parseCollectorConfig, type CollectorConfig } from './collector.js';
import { SourceError, hash } from './contract.js';
import { boundOrders, captureSource, sourceActor } from './service.js';
import { collectSelectedSourceOnce, validateSelectedSourceOnce, type SelectedSourceRequest } from './selected-source-once.js';

/** One explicit, full bound scope. No binding, target enablement, or scheduling.
 * The approved list must equal the DB list both before and inside capture's lock.
 * Injection is internal test support, never exposed as a CLI configuration. */
export async function refreshBoundMaterialsOnce(pool:Pool,actor:Pick<TrustedIdentity,'internalUserId'|'userId'>,
  config:CollectorConfig,contracts:readonly string[],
  collect?:(config:CollectorConfig,request:SelectedSourceRequest)=>Promise<unknown>) {
  const checked=parseCollectorConfig(config), selected=selectContracts(contracts.join(','));
  if(selected.length!==contracts.length||hash([...contracts].sort())!==hash(selected))throw new SourceError('bounded_material_scope_invalid');
  await sourceActor(pool,actor,true,false);
  await requireAdditionProfile(pool,checked.sourceKey,accountFingerprint(checked));
  const targets=await boundOrders(pool),scope=hash(targets);
  const sameContracts=(values:readonly string[])=>hash([...values].sort())===hash(selected);
  if(!sameContracts(targets.map(t=>t.salesContractNo!)))throw new SourceError('bounded_material_scope_changed');
  let metrics:Awaited<ReturnType<typeof collectSelectedSourceOnce>>['metrics']|undefined;
  const result=await captureSource(pool,actor,{sourceKey:checked.sourceKey,accountFingerprint:accountFingerprint(checked),maxAgeMs:600000,requireExistingProfile:true,
    collect:async currentContracts=>{
      await requireAdditionProfile(pool,checked.sourceKey,accountFingerprint(checked));
      if(!sameContracts(currentContracts)||hash(await boundOrders(pool))!==scope)throw new SourceError('bounded_material_scope_changed');
      const request:SelectedSourceRequest={mode:'bound-materials',targets};
      const capture=collect?await validateSelectedSourceOnce(await collect(checked,request),checked,request)
        :await collectSelectedSourceOnce(checked,request);
      if(capture.result!=='complete')throw new SourceError(capture.code);
      metrics=capture.metrics;
      return capture.bundle;
    }});
  return {...result,metrics};
}
