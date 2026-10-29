import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseClosingMonthIntent, releaseMonthExecutors, type ClosingExecutorRelease } from './month-plan-model.js';
test('explicit release retains every portion identity, exact quantity, color and month', () => {
  const assignmentId=randomUUID(), other=randomUUID(), lines=[{id:randomUUID(),colorId:randomUUID(),assignmentId,month:'2027-01',quantity:'0.000001'},
    {id:randomUUID(),colorId:null,assignmentId:other,month:null,quantity:'999999999998.999999'}];
  const before=structuredClone(lines), intent=parseClosingMonthIntent({action:'release_executors',orderId:randomUUID(),expectedVersion:3,reason:'Explicit review',assignmentIds:[assignmentId],observedExecutorFingerprint:'a'.repeat(64)}) as ClosingExecutorRelease;
  const result=releaseMonthExecutors(lines,intent);
  assert.deepEqual(lines,before); assert.deepEqual(result.lines.find(x=>x.id===lines[0].id),{...lines[0],assignmentId:null});
  assert.deepEqual(result.lines.find(x=>x.id===lines[1].id),lines[1]);assert.equal(result.releasedQuantity,'0.000001');assert.deepEqual(result.touchedMonths,['2027-01']);
  for (const patch of [{assignmentIds:[]},{assignmentIds:[assignmentId,assignmentId]},{observedExecutorFingerprint:'bad'},{sale:'1'}])
    assert.throws(()=>parseClosingMonthIntent({...intent,...patch}));
  assert.throws(()=>releaseMonthExecutors(lines,{...intent,assignmentIds:[randomUUID()]}));
});
