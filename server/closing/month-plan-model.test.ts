import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moveMonthQuantities, parseClosingMonthMove, sumMonthQuantities, validateMonthLines, type ClosingMonthLine } from './month-plan-model.js';
const fails=(code:string)=>(error:unknown)=>(error as {code:string}).code===code;
function fixture(){
 const orderId=randomUUID(),colorId=randomUUID(),otherColor=randomUUID(),assignmentId=randomUUID();
 const lines:ClosingMonthLine[]=[{id:randomUUID(),colorId,assignmentId:null,month:'2026-10',quantity:'2000.125'},
  {id:randomUUID(),colorId:otherColor,assignmentId,month:'2026-11',quantity:'1000.875'}];
 return {orderId,lines,intent:{action:'move_months',orderId,expectedVersion:1,targetMonth:'2026-11',reason:'Customer request',selection:{mode:'partial',items:[{lineId:lines[0].id,quantity:'1000'}]}}};
}
test('partial month moves conserve exact fractional quantity and all color/execution identities',()=>{
 const f=fixture(),before=structuredClone(f.lines),intent=parseClosingMonthMove(f.intent),result=moveMonthQuantities(f.lines,intent,()=>randomUUID());
 assert.equal(sumMonthQuantities(result.lines),'3001');assert.deepEqual(f.lines,before);assert.equal(result.movedQuantity,'1000');
 assert.equal(result.lines.find(x=>x.colorId===before[0].colorId&&x.month==='2026-10')?.quantity,'1000.125');
 assert.equal(result.lines.find(x=>x.assignmentId!==null)?.quantity,'1000.875');
});
test('whole-order move coalesces same scope but never combines different colors',()=>{
 const f=fixture(),intent=parseClosingMonthMove({...f.intent,targetMonth:'2026-12',selection:{mode:'whole'}});
 const result=moveMonthQuantities(f.lines,intent,()=>randomUUID());
 assert.equal(result.lines.length,2);assert(result.lines.every(x=>x.month==='2026-12'));assert.equal(result.movedQuantity,'3001');
});
test('unassigned month can move, but excess, missing source and no-op are rejected',()=>{
 const f=fixture();f.lines[0].month=null;
 assert.equal(moveMonthQuantities(f.lines,parseClosingMonthMove(f.intent),()=>randomUUID()).lines.length,3);
 assert.throws(()=>moveMonthQuantities(f.lines,parseClosingMonthMove({...f.intent,selection:{mode:'partial',items:[{lineId:f.lines[0].id,quantity:'2001'}]}}),()=>randomUUID()),fails('closing_month_quantity_exceeded'));
 assert.throws(()=>moveMonthQuantities(f.lines,parseClosingMonthMove({...f.intent,selection:{mode:'partial',items:[{lineId:randomUUID(),quantity:'1'}]}}),()=>randomUUID()),fails('closing_month_line_changed'));
 assert.throws(()=>moveMonthQuantities(f.lines,parseClosingMonthMove({...f.intent,selection:{mode:'partial',items:[{lineId:f.lines[1].id,quantity:'1'}]}}),()=>randomUUID()),fails('closing_month_no_change'));
});
test('client cannot submit prices, change source quantity or forge color scope',()=>{
 const f=fixture();
 for(const extra of [{price:'1'},{sourceQuantity:'1'},{fxRate:'7'}])assert.throws(()=>parseClosingMonthMove({...f.intent,...extra}),fails('invalid_closing_month_command'));
 assert.throws(()=>parseClosingMonthMove({...f.intent,selection:{mode:'partial',items:[{lineId:f.lines[0].id,quantity:'1',colorId:randomUUID()}]}}),fails('invalid_closing_month_command'));
 assert.throws(()=>validateMonthLines(f.lines,'3002'),fails('invalid_closing_month_command'));
 assert.throws(()=>parseClosingMonthMove({...f.intent,selection:{mode:'partial',items:[f.intent.selection.items[0],f.intent.selection.items[0]]}}),fails('invalid_closing_month_command'));
});
test('all months and exact millionth-piece boundaries survive without Number conversion',()=>{
 const f=fixture();f.lines[0].quantity='999999999998.999999';f.lines[1].quantity='0.000001';
 const result=moveMonthQuantities(f.lines,parseClosingMonthMove({...f.intent,selection:{mode:'partial',items:[{lineId:f.lines[0].id,quantity:'0.000001'}]}}),()=>randomUUID());
 assert.equal(sumMonthQuantities(result.lines),'999999999999');assert.equal(result.lines.find(x=>x.month==='2026-10')?.quantity,'999999999998.999998');
});

test('a split beyond the persisted line limit is an explicit domain rejection',()=>{
 const f=fixture(),lines:ClosingMonthLine[]=Array.from({length:2000},()=>({id:randomUUID(),colorId:randomUUID(),assignmentId:null,month:'2026-10',quantity:'2'}));
 const intent=parseClosingMonthMove({...f.intent,selection:{mode:'partial',items:[{lineId:lines[0].id,quantity:'1'}]}});
 assert.throws(()=>moveMonthQuantities(lines,intent,()=>randomUUID()),fails('closing_month_plan_too_large'));
 assert.equal(sumMonthQuantities(lines),'4000');
});
