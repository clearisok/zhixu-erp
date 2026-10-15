import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeTrimPriorityKeywords,orderMaterialGroups} from '../features/style-progress/model/material-display-order.ts';
const group=(key,type,name,quantities)=>({key,type,name,rows:quantities.map((value,index)=>({demand:{id:key+'-'+index,requiredQuantity:value},unit:index%2?'米':'条',purchased:null,inbound:null}))});
test('fabrics precede trims; fabric numeric demand score sorts only display order regardless of units',()=>{
 const source=[group('t1','trim','合成拉链',[200]),group('f1','fabric','合成面料A',[1,3]),group('t2','trim','合成车缝线',[1]),group('f2','fabric','合成面料B',[10])];
 assert.deepEqual(orderMaterialGroups(source,['线','拉链']).map(g=>g.key),['f2','f1','t2','t1']);
});
test('first matching keyword wins and unmatched trim ties keep their source order',()=>{
 const source=[group('a','trim','纽扣',[100]),group('b','trim','带线拉链',[1]),group('c','trim','车缝线',[5]),group('d','trim','包装袋',[300])];
 assert.deepEqual(orderMaterialGroups(source,['拉链','线']).map(g=>g.key),['b','c','a','d']);
 assert.deepEqual(orderMaterialGroups(source,[]).map(g=>g.key),['a','b','c','d']);
});
test('keywords are literal and normalized rather than executable regular expressions',()=>{
 const source=[group('a','trim','ＡＢＣ标签',[1]),group('b','trim','纽扣',[1]),group('c','trim','包装[固定',[1])];
 assert.deepEqual(orderMaterialGroups(source,['[','abc']).map(g=>g.key),['c','a','b']);
 assert.deepEqual(orderMaterialGroups(source,['.*']).map(g=>g.key),['a','b','c']);
});
test('equal fabric demand rankings remain stable',()=>{
 const source=[group('a','fabric','合成布A',[2,3]),group('b','fabric','合成布B',[5])];
 assert.deepEqual(orderMaterialGroups(source,[]).map(g=>g.key),['a','b']);
});
test('sorting never changes demands, units, events, arrays or introduces a business total',()=>{
 const source=[group('a','trim','线',[118,356,6]),group('b','fabric','布',[115.5])],before=structuredClone(source);
 const sorted=orderMaterialGroups(source,['线']);assert.deepEqual(source,before);assert.notEqual(sorted,source);assert.equal(sorted[1],source[0]);
 assert.equal('demandScore' in sorted[0],false);assert.equal(sorted[1].rows[0].demand.requiredQuantity,118);
});
test('invalid and excessively large rankings do not mutate unknown source facts or produce unstable NaN ordering',()=>{
 const source=[group('a','fabric','大数量',[Number.MAX_VALUE,Number.MAX_VALUE]),group('b','fabric','普通',[1]),group('c','fabric','未知',[Number.NaN,-1])];
 assert.deepEqual(orderMaterialGroups(source,[]).map(g=>g.key),['a','b','c']);assert.equal(Number.isNaN(source[2].rows[0].demand.requiredQuantity),true);
});
test('keyword limits and normalized duplicate detection fail closed',()=>{
 for(const input of [null,{},'线',[null],[''],['   '],['线\n'],['线','线'],['ＡＢＣ','abc'],Array(51).fill('线'),['字'.repeat(41)]])assert.throws(()=>normalizeTrimPriorityKeywords(input),/invalid_trim_priority_keywords/);
 assert.deepEqual(normalizeTrimPriorityKeywords([' 线 ','拉链']),['线','拉链']);assert.deepEqual(normalizeTrimPriorityKeywords([]),[]);
 assert.equal(normalizeTrimPriorityKeywords(['🧵'.repeat(40)])[0].length,80);
});
