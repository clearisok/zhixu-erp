import test from 'node:test';
import assert from 'node:assert/strict';
import { priceOperationLocks } from '../price-operation-locks';
test('unreadable or corrupt originals never permit another price workflow',()=>{
 const user='synthetic-user',values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null};
 assert.deepEqual(priceOperationLocks(storage,user),{sale:false,labor:false,unavailable:false});
 values.set('zhixu.server.order-price.pending.v1.'+user,'{corrupt');assert.deepEqual(priceOperationLocks(storage,user),{sale:true,labor:false,unavailable:false});
 values.set('zhixu.server.usd-labor.pending.v1.'+user,'');assert.deepEqual(priceOperationLocks(storage,user),{sale:true,labor:true,unavailable:false});
 assert.equal(values.size,2);assert.deepEqual(priceOperationLocks({getItem(){throw Error('storage denied');}},user),{sale:true,labor:true,unavailable:true});
 assert.deepEqual(priceOperationLocks(storage,'another-user'),{sale:false,labor:false,unavailable:false});
});
