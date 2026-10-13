import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverAdditions, previewAdditions, selectContracts, type BoundIdentity } from '../ainuoke-source/additions.js';
import { additionBundle, additionDiscoveryBundle } from './ainuoke-binding-fixture.js';
import { syntheticOrder } from './ainuoke-source-fixture.js';
import { parseSourceArguments } from '../ainuoke-source/cli.js';

const first: BoundIdentity = {id:'synthetic-order-1',sourceId:'synthetic-1',salesContractNo:syntheticOrder.salesContractNo};
const bound = [first];
const next = syntheticOrder.salesContractNo+'-1';

test('operator CLI requires one explicit action, target and exact selection for addition',()=>{
  const target='a'.repeat(64);const review='b'.repeat(64);const config='C:/private/source.json';
  assert.equal(parseSourceArguments([`--discover-add=first-team`,`--expected-target=${target}`,`--config=${config}`]).action,'discover-add');
  assert.equal(parseSourceArguments([`--preview-add=first-team`,`--contracts=${next}`,`--expected-target=${target}`,`--config=${config}`]).action,'preview-add');
  assert.equal(parseSourceArguments([`--add=first-team`,`--contracts=${next}`,`--expected-target=${target}`,`--expected-preview=${review}`,`--config=${config}`]).action,'add');
  for(const args of [
    [`--add=first-team`,`--contracts=${next}`,`--expected-target=${target}`,`--config=${config}`],
    [`--preview-add=first-team`,`--expected-target=${target}`,`--config=${config}`],
    [`--preview-add=first-team`,`--contracts=${next},${next}`,`--expected-target=${target}`,`--config=${config}`],
    [`--discover-add=first-team`,`--contracts=${next}`,`--expected-target=${target}`,`--config=${config}`],
  ]) assert.throws(()=>parseSourceArguments(args));
});

test('complete Discovery lists only new visible contracts; source absence and identity drift block intake',async()=>{
  const found=await discoverAdditions(additionDiscoveryBundle(),bound);
  assert.equal(found.visibleContracts,2);
  assert.equal(found.boundContracts,1);
  assert.equal(found.unboundContracts,1);
  assert.equal(found.additions[0].salesContractNo,next);
  const disappeared=additionDiscoveryBundle();
  disappeared.discoveryBefore[0].rows.splice(0,1);
  disappeared.discoveryBefore[0].total=1;
  disappeared.discoveryAfter=structuredClone(disappeared.discoveryBefore);
  await assert.rejects(discoverAdditions(disappeared,bound),/source_visibility_changed/);
  const replaced=additionDiscoveryBundle();
  replaced.discoveryBefore[0].rows[0].values.id='synthetic-replaced';
  replaced.discoveryAfter=structuredClone(replaced.discoveryBefore);
  await assert.rejects(discoverAdditions(replaced,bound),/source_identity_changed/);
});

test('review hash binds selected mapped facts; immediate exact retry has the same review hash',async()=>{
  const source=additionBundle();
  const reviewed=await previewAdditions(source,[next],bound);
  assert.equal(reviewed.alreadyBound,false);
  assert.equal(reviewed.candidates.length,1);
  assert.equal(reviewed.candidates[0].source.quantity,100);
  assert.equal(reviewed.candidates[0].colors.length,1);
  const selectedBound=[...bound,{id:'synthetic-order-2',sourceId:'synthetic-2',salesContractNo:next}];
  const retry=await previewAdditions(source,[next],selectedBound);
  assert.equal(retry.alreadyBound,true);
  assert.equal(retry.reviewHash,reviewed.reviewHash);
  const changed=structuredClone(source);
  changed.discoveryBefore[0].rows[1].values.Num=200;
  changed.discoveryAfter=structuredClone(changed.discoveryBefore);
  assert.notEqual((await previewAdditions(changed,[next],bound)).reviewHash,reviewed.reviewHash);
});

test('invalid selection, missing color scope, changed Discovery, unknown quantity and invalid date fail closed',async()=>{
  for(const value of ['',next+','+next,Array.from({length:26},(_,i)=>`B-${i}`).join(',')])
    assert.throws(()=>selectContracts(value));
  const missing=additionBundle();missing.colors={};
  await assert.rejects(previewAdditions(missing,[next],bound),/addition_color_scope_mismatch/);
  const extra=additionBundle();extra.colors['WRONG']=extra.colors[next];
  await assert.rejects(previewAdditions(extra,[next],bound),/addition_color_scope_mismatch/);
  const unstable=additionBundle();unstable.discoveryAfter[0].rows[1].values.Num=300;
  await assert.rejects(previewAdditions(unstable,[next],bound),/discovery_changed/);
  const blank=additionBundle();blank.discoveryBefore[0].rows[1].values.Num=null;blank.discoveryAfter=structuredClone(blank.discoveryBefore);
  await assert.rejects(previewAdditions(blank,[next],bound),/binding_quantity_missing/);
  const date=additionBundle();date.discoveryBefore[0].rows[1].values.DeliveryDate='2026-02-30';date.discoveryAfter=structuredClone(date.discoveryBefore);
  await assert.rejects(previewAdditions(date,[next],bound),/binding_date_invalid/);
  const partial=additionBundle(Date.now(),3,[1,2]);
  await assert.rejects(previewAdditions(partial,[next,syntheticOrder.salesContractNo+'-2'],
    [...bound,{id:'synthetic-order-2',sourceId:'synthetic-2',salesContractNo:next}]),/addition_partial_retry/);
});
