import type {BindingBundle} from "../ainuoke-source/binding.js";
import {hash} from "../ainuoke-source/contract.js";
import type {SourceBundle} from "../ainuoke-source/contract.js";
import type {AinuokeSourceRow} from "../../features/ainuoke-api/model/ainuoke-api.js";
export type WorkbookRows=Record<string,unknown[][]>;
export const cases=['正常四流（合成）','单位缺失（合成）','单位冲突（合成）','颜色无效（合成）','含确认数量115.50与118（其他字段合成）','含确认数量356两行归并（其他字段合成）'];
const txt=(v:unknown)=>v===null||v===undefined?'':String(v);
export function demoBundles(workbook:WorkbookRows={},now=Date.now()):{binding:BindingBundle;materials:SourceBundle}{
 const stamp=new Date(now).toISOString();const extra=(workbook['订单核对']??[]).filter(r=>r[0]);
 const titles=[...cases,...extra.map((r,i)=>'Excel模拟订单 '+(i+1)+' · '+txt(r[4]))];
 const rows:AinuokeSourceRow[]=titles.map((title,i)=>({sourceRowIdentity:'synthetic-discovery-'+i,values:{id:'fixture-'+i,BillNo:'SC-DEMO-'+String(i+1).padStart(3,'0'),InsideOrderNo:'IN-DEMO-'+i,Status:'生效',GoodsDesc:title,Num:i>=6?Number(extra[i-6][6]):i===4||i===5?5000:100,ContractDate:'2026-10-01',DeliveryDate:i>=6?txt(extra[i-6][7]):'2026-11-01',CompanyName:'隔离演示公司',CustomerName:'隔离演示客户',Brand:'隔离演示'}}));
 const discovery:SourceBundle['discoveryBefore']=[{schemaVersion:'ainuoke-direct-read.v2',reportId:'6086103',fetchedAt:stamp,page:1,pageSize:50,total:rows.length,queryContext:{},snapshotHash:'synthetic-discovery',rows}];
 const colors:BindingBundle['colors']={},materials:SourceBundle['materials']={};
 for(const [i,row] of rows.entries()){
  const bill=txt(row.values.BillNo),inside=txt(row.values.InsideOrderNo),style=txt(row.values.GoodsDesc);
  colors[bill]=[{schemaVersion:'ainuoke-direct-read.v2',reportId:'6087105',fetchedAt:stamp,page:1,pageSize:50,total:1,queryContext:{salesContractNo:bill},snapshotHash:'synthetic-color-'+i,rows:[{sourceRowIdentity:'synthetic-color-'+i,values:{BillNo:bill,insideorderno:inside,GoodsNo:style,CnColor:i===3?'':'蓝色',DeliveryDate:'2026-11-01',SizeNum:i===3?null:row.values.Num,SizeRule:'M',Size1:row.values.Num}}]}];
  const actual=i===4?118:i===5?356:100;
  // TotalNum=100 and movement/pricing fields are explicit synthetic facts, not inferred real sample fields.
  const values={id:'M-DEMO-'+i,ExpContractNo:bill,insideorderno:inside,styleno:style,lx:'辅料',GoodsNo:'MAT-DEMO-'+i,CnName:i===4?'确认样本A（脱敏）':i===5?'确认样本B（脱敏）':'合成物料 '+(i+1),CnColor:'蓝色',CnComposition:'合成规格',SupplyType:'自购',StyleColor:'蓝色',StyleNum:i===4||i===5?5000:100,TotalNum:100,Num:i===4?.021:i===5?.067:1,Lost:i===4?10:i===5?5:0,QtyUnit:i===1?null:'个',cgnum:actual,cgdh:'PO-DEMO-'+i,cgrq:'2026-10-01',SupplierName:'隔离合成供应商',cgprice:2,goodsamount:actual*2,CurrencyName:'CNY',rknum:actual,rkdh:'IN-DEMO-'+i,rkrq:'2026-10-02',CYNum:actual,cydh:'SHIP-DEMO-'+i,cyrq:'2026-10-03',OutStoreNum:actual,ckdh:'OUT-DEMO-'+i,ckrq:'2026-10-04'};
  const sourceRows:AinuokeSourceRow[]=[{sourceRowIdentity:'synthetic-material-'+i+'-a',values}];
  if(i===2||i===5)sourceRows.push({sourceRowIdentity:'synthetic-material-'+i+'-b',values:{...values,id:values.id+'-b',...(i===2?{QtyUnit:'米'}:{})}});
  for(const sourceRow of sourceRows)sourceRow.sourceRowIdentity='6087050:sha256:'+hash(sourceRow.values);
  if(i>=6){colors[bill][0].rows=[];colors[bill][0].total=0;sourceRows.length=0;} // Excel order without authoritative mapped movement stays explicitly empty.
  materials[bill]=[{schemaVersion:'ainuoke-direct-read.v2',reportId:'6087050',fetchedAt:stamp,page:1,pageSize:50,total:sourceRows.length,queryContext:{insideOrderNo:inside},snapshotHash:'synthetic-material-'+i,rows:sourceRows}];
 }
 return {binding:{schemaVersion:'ainuoke-order-binding.v1',discoveryBefore:discovery,discoveryAfter:structuredClone(discovery),colors},materials:{schemaVersion:'ainuoke-server-source.v1',discoveryBefore:discovery,discoveryAfter:structuredClone(discovery),materials}};
}