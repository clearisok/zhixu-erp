import test from 'node:test';import assert from 'node:assert/strict';import {boundedSyncBatch} from './sync-batch.js';
test('automatic groups share directory budget and manual/retry remains single-contract',()=>{
const rows=Array.from({length:10},(_,i)=>({id:i,kind:'automatic',retry_of:null,detail_pages:6}));
assert.equal(boundedSyncBatch(rows,5,617).length,5);
assert.equal(boundedSyncBatch(rows,5,1400).length,3);
assert.equal(boundedSyncBatch([{...rows[0],kind:'manual'},...rows],5,617).length,1);
assert.equal(boundedSyncBatch([{...rows[0],retry_of:'failed'},...rows],5,617).length,1);
assert.equal(boundedSyncBatch(rows.map(x=>({...x,detail_pages:30})),5,617).length,1);
});
