import test from 'node:test';
import assert from 'node:assert/strict';
import {parseClosingYearQuery} from './annual-contract.js';
import {closingAmount} from './contract.js';
import {closingReferenceStatus,summarizeYearAmounts} from './annual-model.js';
import type {ClosingExecutionReference} from './basis-model.js';

test('annual query has explicit year, independent scope/status and AND search tokens; no price or duplicate filters',()=>{
 assert.deepEqual(parseClosingYearQuery(new URLSearchParams('year=2027&search=++SO+++Blue++')),
  {year:'2027',scope:'all',production:'all',search:'SO Blue',offset:0,limit:25});
 for(const query of ['','year=2027&year=2028','year=2027&scope=unknown','year=2027&price=1','year=2027&limit=51','year=2027&production=planned'])
  assert.throws(()=>parseClosingYearQuery(new URLSearchParams(query)),{code:'invalid_closing_year_query'});
});
test('annual output never replaces missing prices/tax with zero or sums rounded lines',()=>{
 const one={visibility:'allowed' as const,currency:'CNY' as const,state:'known' as const,price:'1',amount:closingAmount('1','1','20')};
 const full=summarizeYearAmounts([one,one,one],'CNY',true);assert.equal(full.visibility,'allowed');if(full.visibility!=='allowed')assert.fail();assert.equal(full.amount!.decimal,'2.5');
 const partial=summarizeYearAmounts([one,{visibility:'allowed',currency:'CNY',state:'blocked',reason:'period_tax_required'}],'CNY',true);
 if(partial.visibility!=='allowed')assert.fail();assert.equal(partial.amount,null);assert.equal(partial.state,'incomplete');assert.equal(partial.knownSubtotal.decimal,'0.833333');
 assert.deepEqual(summarizeYearAmounts([one],'CNY',false),{visibility:'restricted'});
 const zero=summarizeYearAmounts([{visibility:'allowed',currency:'USD',state:'known',price:'0',amount:closingAmount('100','0',null)}],'USD',true);
 if(zero.visibility!=='allowed')assert.fail();assert.equal(zero.amount!.decimal,'0');assert.equal(zero.blockedPortions,0);
});
test('production reference comes from actual records, not a plan, month or monetary state',()=>{
 assert.equal(closingReferenceStatus('100','0',[]),'not_started');
 assert.equal(closingReferenceStatus('100','99.999999',[]),'in_progress');
 assert.equal(closingReferenceStatus('100','100',[]),'completed');
 assert.equal(closingReferenceStatus(null,'100',[]),'in_progress');
 const reference={execution:{version:1,status:'in_progress',completedQuantity:'0',actualStartDate:'2027-01-01',actualCompletedDate:null}} as ClosingExecutionReference;
 assert.equal(closingReferenceStatus('100','0',[reference]),'in_progress');
});
