import {closingFail} from './contract.js';

export type ClosingYearQuery={year:string;scope:'all'|'internal'|'outsource'|'unassigned';production:'all'|'not_started'|'in_progress'|'completed';search:string;offset:number;limit:number};
/** The same explicit query is echoed to the client; no clock, money or FX input. */
export function parseClosingYearQuery(params:URLSearchParams):ClosingYearQuery{
 const fail=()=>closingFail(400,'invalid_closing_year_query');
 const allowed=['year','scope','production','search','offset','limit'];
 if([...params.keys()].some(key=>!allowed.includes(key)||params.getAll(key).length!==1))fail();
 const year=params.get('year'),scope=params.get('scope')??'all',production=params.get('production')??'all',raw=params.get('search')??'';
 if(year===null||!/^(19|20|21)\d{2}$/u.test(year)||!['all','internal','outsource','unassigned'].includes(scope)
  ||!['all','not_started','in_progress','completed'].includes(production)||raw.length>300||raw.includes('\0')
  ||new TextDecoder('utf8',{ignoreBOM:true}).decode(new TextEncoder().encode(raw))!==raw)fail();
 const integer=(key:string,fallback:number,min:number,max:number)=>{const value=params.get(key);if(value===null)return fallback;
  if(!/^\d{1,8}$/u.test(value)||Number(value)<min||Number(value)>max)fail();return Number(value);};
 return {year:year!,scope:scope as ClosingYearQuery['scope'],production:production as ClosingYearQuery['production'],search:raw.trim().replace(/\s+/gu,' '),
  offset:integer('offset',0,0,100000),limit:integer('limit',25,1,50)};
}
