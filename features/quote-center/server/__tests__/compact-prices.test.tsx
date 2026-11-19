import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {ServerListCell,serverListHeader} from '../../components/server-list-cell.tsx';
import {businessValues,type BusinessSource} from '../../model/quote-business-view.ts';
import {createQuoteDraft} from '../../model/quote-view-model.ts';
import {normalizeServerListPreferences} from '../list-preferences.ts';
import {presentedListColumns,fittedPresentedTablePreference} from '../list-presentation.ts';
import type {QuoteServerListItem} from '../quote-server-client.ts';
const grants=['quote.view','quote.cost.view','commercial.sale.view'];
function source():BusinessSource {
 const revision=createQuoteDraft('synthetic-compact','QT-COMPACT','2026-11-19').revisions[0];
 return {id:'synthetic-compact',quoteCode:'QT-COMPACT',version:1,revisionId:revision.revisionId,revisionLabel:'V1',status:'draft',baseInfo:revision.baseInfo,versions:[
  {id:'pv-a',name:'A',quantity:null,confirmation:{linkage:'unlinked',labor:null,garment:null,currency:'CNY',confirmed:false,termsVersion:null}},
  {id:'pv-b',name:'B',quantity:null,confirmation:{linkage:'unlinked',labor:null,garment:null,currency:'CNY',confirmed:false,termsVersion:null}}]};
}
function render(s:BusinessSource) {
 const row={id:s.id,business:{...businessValues(s,['confirmedGarment','confirmationStatus']),garmentPrice:{value:9.9,display:'¥9.9'}},summary:{priceVersionCount:2}} as QuoteServerListItem;
 return {confirmed:renderToStaticMarkup(<ServerListCell row={row} fields={['confirmedGarment','confirmationStatus']}/>),calculated:renderToStaticMarkup(<ServerListCell row={row} fields={['garmentPrice']}/>),row};
}
test('calculated and real confirmed values stay independent through three states, including zero and multiple distinct prices',()=>{
 const s=source();let view=render(s);
 assert.match(view.confirmed,/—/);assert.match(view.confirmed,/未确认/);assert.doesNotMatch(view.confirmed,/9\.9/);
 assert.match(view.calculated,/¥9\.9/);assert.doesNotMatch(view.calculated,/未确认|部分确认|全部确认/);
 Object.assign(s.versions[0].confirmation!,{labor:'1',garment:'0',confirmed:true});view=render(s);
 assert.match(view.confirmed,/¥0\.00/);assert.match(view.confirmed,/部分确认/);assert.match(view.confirmed,/查看价格方案/);
 Object.assign(s.versions[1].confirmation!,{labor:'2',garment:'105.25',confirmed:true});view=render(s);
 assert.match(view.confirmed,/¥0\.00 – ¥105\.25/);assert.match(view.confirmed,/全部确认/);assert.doesNotMatch(view.confirmed,/52\.625|9\.9/);
 assert.equal(serverListHeader(['garmentPrice']),'成衣价格');assert.equal(serverListHeader(['confirmedGarment','confirmationStatus']),'客户确认');
});
test('unknown linkage remains explicit, hidden price/source never leaks via a status-only cell',()=>{
 const s=source();s.versions[0].confirmation!.linkage='unknown';const {confirmed,row}=render(s);
 assert.match(confirmed,/—/);assert.match(confirmed,/关联未核实/);assert.doesNotMatch(confirmed,/未确认|9\.9/);
 row.business!.confirmedGarment={value:111.23,display:'PRIVATE-PRICE'};row.confirmationSources=[{priceVersionId:'PRIVATE-ID',linkage:'linked',termsVersion:2}];
 const statusOnly=renderToStaticMarkup(<ServerListCell row={row} fields={['brand']}/>);assert.doesNotMatch(statusOnly,/PRIVATE/);
});
test('old original UI preferences gain the independent confirmed field once without writes or losing manual sizing; explicit hiding and permissions persist',()=>{
 const old={presentation:'original',visibleColumns:['garmentPrice','confirmationStatus'],columnOrder:['garmentPrice','confirmationStatus'],columnWidths:{garmentPrice:137},groupWidths:{'group.price':168}};
 const migrated=normalizeServerListPreferences('u',grants,old);assert.ok(migrated.visibleColumns.includes('confirmedGarment'));assert.equal(migrated.columnWidths.garmentPrice,137);assert.deepEqual(normalizeServerListPreferences('u',grants,migrated),migrated);
 assert.deepEqual(presentedListColumns(migrated).map(c=>c.fields),[['garmentPrice'],['confirmationStatus','confirmedGarment']]);
 const hidden=normalizeServerListPreferences('u',grants,{...migrated,visibleColumns:['garmentPrice','confirmationStatus']});assert.ok(!hidden.visibleColumns.includes('confirmedGarment'));
 const revoked=normalizeServerListPreferences('u',['quote.view'],old);assert.ok(!revoked.visibleColumns.includes('confirmedGarment'));
 const independent=normalizeServerListPreferences('u',grants,{...old,presentation:'fields'});assert.ok(!independent.visibleColumns.includes('confirmedGarment'));
 for(const width of [1110,1184,1664,2304]) {const p=normalizeServerListPreferences('u',grants);const table=fittedPresentedTablePreference(p,width);assert.ok(Object.values(table.columnWidths).every(w=>w>=56));assert.ok(Object.values(table.columnWidths).reduce((a,b)=>a+b,104)<=Math.max(width,1110));}
});
