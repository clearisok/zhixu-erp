import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { businessCanonical, businessDigest, packContent, type ContentScope } from './shared-content.js';
import type { AinuokeReportSnapshot } from '../../features/ainuoke-api/model/ainuoke-api.js';

const scope:ContentScope={sourceKey:'synthetic',accountFingerprint:'a'.repeat(64),sourceId:'1',contract:'FULL-CONTRACT-01',kind:'materials'};
const page=(rows:Record<string,unknown>[],time='2026-11-24T00:00:00Z'):AinuokeReportSnapshot=>({schemaVersion:'ainuoke-direct-read.v2',reportId:'6087050',
 fetchedAt:time,page:1,pageSize:50,total:rows.length,queryContext:{insideOrderNo:'I-01'},snapshotHash:'original-page-proof',
 rows:rows.map((values,i)=>({sourceRowIdentity:'original-'+i,values}))});

test('typed canonical golden vector is deterministic UTF-8, with exact JSON types',()=>{
 const encoded='o2{s1:as1:1s1:bn1;}';
 assert.equal(businessCanonical({b:1,a:'1'}),encoded);
 assert.equal(businessDigest({b:1,a:'1'}),createHash('sha256').update(encoded).digest('hex'));
 assert.equal(businessCanonical({'😀':1,'\ue000':2}),'o2{s3:\ue000n2;s4:😀n1;}');
 const keys=['a','aa','中','\ue000','😀','\ud800','\udfff','\ufffd'];
 const expectedKeys=[...keys].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
 const original=Object.fromEntries(keys.map(key=>[key,1]));
 assert.equal(businessCanonical(original),'o8{'+expectedKeys.map(key=>`s${Buffer.byteLength(key)}:${key}n1;`).join('')+'}');
 const different=[null,'',0,false,'0','1',1,'1.0',{},[],{a:null},{a:''}].map(businessDigest);
 assert.equal(new Set(different).size,different.length);
 for(const number of [NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>businessDigest(number),/content_number_unsafe/);
});
test('validated page order, row order, pagination and capture times do not invent a business change',()=>{
 const rows=[{id:'1',quantity:'115.50',date:'2026-11-24',nested:['M','L']},{id:'2',quantity:0}];
 const a=packContent(scope,[page(rows)]),bPage=page([...rows].reverse(),'2026-11-25T00:00:00Z');
 assert.equal(a.businessHash,businessDigest(a.body));
 assert.equal(a.canonicalSize,Buffer.byteLength(businessCanonical(a.body)));
 bPage.snapshotHash='different-proof';bPage.rows.forEach((r,i)=>r.sourceRowIdentity='new-derived-'+i);
 const b=packContent(scope,[bPage]);assert.equal(a.businessHash,b.businessHash);assert.notEqual(a.captureHash,b.captureHash);
 const pages=rows.map((row,i)=>({...page([row]),page:i+1,pageSize:1,total:2}));
 assert.equal(packContent(scope,pages).businessHash,a.businessHash);
 for(const key of ['quantity','date','id'] as const){const changed=structuredClone(rows);changed[0][key]='changed';assert.notEqual(packContent(scope,[page(changed)]).businessHash,a.businessHash);}
 const nested=structuredClone(rows);nested[0].nested!.reverse();assert.notEqual(packContent(scope,[page(nested)]).businessHash,a.businessHash);
 assert.notEqual(packContent(scope,[page([...rows,rows[0]])]).businessHash,a.businessHash);
 assert.notEqual(packContent({...scope,accountFingerprint:'b'.repeat(64)},[page(rows)]).businessHash,a.businessHash);
 assert.notEqual(packContent({...scope,contract:'FULL-CONTRACT-02'},[page(rows)]).businessHash,a.businessHash);
 assert.notEqual(packContent(scope,[page([])]).businessHash,a.businessHash);
});
