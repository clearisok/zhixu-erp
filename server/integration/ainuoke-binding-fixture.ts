import type { BindingBundle } from "../ainuoke-source/binding.js";
import type { AdditionBundle, AdditionDiscoveryBundle } from "../ainuoke-source/additions.js";
import { bundle, syntheticOrder } from "./ainuoke-source-fixture.js";
export function bindingBundle(now=Date.now(),count=1):BindingBundle {
  const b=bundle();const stamp=new Date(now).toISOString();
  const discovery=structuredClone(b.discoveryBefore);discovery[0].fetchedAt=stamp;discovery[0].total=count;
  discovery[0].rows=Array.from({length:count},(_,i)=>({sourceRowIdentity:"synthetic-binding-"+i,values:{id:"synthetic-"+(i+1),BillNo:i===0?syntheticOrder.salesContractNo:syntheticOrder.salesContractNo+"-"+i,InsideOrderNo:"SYNTHETIC-IN-OLD"+(i||""),Status:i%2?"草拟":"生效",GoodsDesc:syntheticOrder.styleNo,Num:100,ContractDate:"2026-10-01",DeliveryDate:"2026-11-01",CompanyName:"合成公司",CustomerName:"合成客户",Brand:"合成品牌"}}));
  const colors:BindingBundle["colors"]={};
  for(const row of discovery[0].rows) {
    const bill=String(row.values.BillNo);
    colors[bill]=[{schemaVersion:"ainuoke-direct-read.v2",reportId:"6087105",fetchedAt:stamp,page:1,pageSize:50,total:1,queryContext:{salesContractNo:bill},snapshotHash:"synthetic-color",
      rows:[{sourceRowIdentity:"synthetic-color-"+bill,values:{BillNo:bill,insideorderno:row.values.InsideOrderNo,GoodsNo:syntheticOrder.styleNo,CnColor:"蓝色",DeliveryDate:"2026-11-01",SizeNum:100,SizeRule:"M,L",Size1:40,Size2:60}}]}];
  }
  return {schemaVersion:"ainuoke-order-binding.v1",discoveryBefore:discovery,discoveryAfter:structuredClone(discovery),colors};
}
export function freshMaterialBundle(now=Date.now()) {
 const b=bundle();const stamp=new Date(now).toISOString();
 for(const p of [...b.discoveryBefore,...b.discoveryAfter,...Object.values(b.materials).flat()])p.fetchedAt=stamp;
 return b;
}
export function additionBundle(now=Date.now(), count=2, selected=[1]):AdditionBundle {
  const source=bindingBundle(now,count);
  const colors: AdditionBundle['colors']={};
  for(const index of selected){
    const bill=String(source.discoveryBefore[0].rows[index].values.BillNo);
    colors[bill]=source.colors[bill];
  }
  return {schemaVersion:'ainuoke-order-addition.v1',discoveryBefore:source.discoveryBefore,
    discoveryAfter:source.discoveryAfter,colors};
}
export function additionDiscoveryBundle(now=Date.now(),count=2):AdditionDiscoveryBundle {
  const source=bindingBundle(now,count);
  return {schemaVersion:'ainuoke-order-addition-discovery.v1',discoveryBefore:source.discoveryBefore,
    discoveryAfter:source.discoveryAfter};
}
