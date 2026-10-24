"use client";
import {useServerNavigationProtection} from '@/components/foundation/server-navigation-protection';
import {useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {useProtectedRouter as useRouter} from '@/components/foundation/server-navigation-protection';
import {AppShell,PageContainer,PageHeader,Card,Button,Modal} from '@/components/foundation';
import {ServerLoginCard,useServerSession} from '@/features/server-auth';
import {quoteAuthority} from '@/features/quote-center/authority/quote-authority';
import {orderMaterialNavigation} from '@/features/ainuoke-material-progress/order-navigation';
import {normalizeTrimPriorityKeywords,type MaterialProgressSettings} from '../model/material-display-order';
import {MaterialSettingsError,materialProgressSettingsClient,materialSettingsMessage,type ProgressSettingsRequest} from '../server/material-progress-settings-client';
import {useMaterialProgressSettings} from '../server/use-material-progress-settings';
type Departure={kind:'navigation';href:string}|{kind:'logout'};
function SettingsBody(){
 const router=useRouter(),params=useSearchParams(),session=useServerSession(),read=useMaterialProgressSettings();
 const route=orderMaterialNavigation(params.get('orderId')),back=route?.detailHref??'/order-center';
 const [base,setBase]=useState<MaterialProgressSettings|null>(null),[draft,setDraft]=useState<string[]>([]),[keyword,setKeyword]=useState('');
 const [pending,setPending]=useState<ProgressSettingsRequest|null>(null),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[departure,setDeparture]=useState<Departure|null>(null);const busy=useRef(false);
 const dirty=base!==null&&JSON.stringify(draft)!==JSON.stringify(base.trimPriorityKeywords),blocked=dirty||keyword.length>0||pending!==null||saving;
 const confirmedNavigation=useServerNavigationProtection({dirty:dirty||keyword.length>0,blocked:saving||Boolean(pending),message:'排序保存结果尚未确认，请先核对原保存请求。'});
 const canEdit=Boolean(base?.canEdit&&read.settings?.canEdit&&session.hasPermission('style_progress.settings.edit'));
 useEffect(()=>{let current=true;const settings=read.settings;if(settings&&(!base||!dirty&&!pending&&settings.version>base.version))queueMicrotask(()=>{if(current){setBase(settings);setDraft([...settings.trimPriorityKeywords]);}});return()=>{current=false;};},[read.settings,base,dirty,pending]);
 useEffect(()=>{if(!blocked)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[blocked]);
 const navigate=(href:string)=>{if(blocked)setDeparture({kind:'navigation',href});else router.push(href);};
 const logout=async()=>{if(blocked){setDeparture({kind:'logout'});return;}await session.logout();router.push('/login');};
 const leave=async()=>{if(!departure||saving)return;try{if(departure.kind==='logout'){await session.logout();router.push('/login');}else confirmedNavigation(()=>router.push(departure.href));}catch{setMessage('退出未完成，修改仍保留，请稍后重试。');setDeparture(null);}};
 const add=()=>{try{const next=normalizeTrimPriorityKeywords([...draft,keyword]);setDraft(next);setKeyword('');setMessage('');}catch{setMessage('请输入不重复的关键词：每项最多40个字符，最多50项。');}};
 const move=(index:number,delta:number)=>setDraft(items=>{const next=[...items],other=index+delta;if(other<0||other>=next.length)return items;[next[index],next[other]]=[next[other],next[index]];return next;});
 const save=async()=>{if(busy.current||!base||!canEdit)return;busy.current=true;setSaving(true);const command=pending??{requestId:crypto.randomUUID(),expectedVersion:base.version,trimPriorityKeywords:[...draft]};setPending(command);setMessage('');try{const result=await materialProgressSettingsClient.save(command);setBase(result.settings);setDraft([...result.settings.trimPriorityKeywords]);setPending(null);setMessage(result.replayed?'已确认原保存结果；正在读取最新设置。':'辅料排列已保存。');read.reload();}catch(error){if(error instanceof MaterialSettingsError&&[400,401,403,409].includes(error.status)){setPending(null);if([401,403,409].includes(error.status))read.reload();}setMessage(materialSettingsMessage(error));}finally{busy.current=false;setSaving(false);}};
 const reload=()=>{if(saving||pending)return;const latest=read.settings;if(latest){setBase(latest);setDraft([...latest.trimPriorityKeywords]);setKeyword('');setMessage('已读取团队最新设置。');}read.reload();};
 return <AppShell title="进度设置" identityMode="server" backTarget={{href:back,label:route?'返回物料跟进':'返回订单列表'}} onRequestNavigation={navigate} onRequestLogout={logout}><PageContainer className="sp-progress-settings">
  <PageHeader title="进度设置" description="团队统一的物料展示顺序"/>
  <Card className="sp-trim-settings"><div className="sp-settings-tab" role="tablist" aria-label="进度设置分类"><button type="button" role="tab" aria-selected="true">辅料排列</button></div>
   {read.loading&&!base?<p>读取团队设置…</p>:!base?<p role="alert">团队设置暂不可用，请稍后重试。<Button variant="text" onClick={read.reload}>重新读取</Button></p>:<>
    <h2>辅料关键词优先级</h2><p>从上到下优先匹配物料名称；同一物料包含多个关键词时，以第一个匹配为准。未匹配的辅料保持来源顺序。</p>
    <p className="sp-settings-meta">{base.configured?'团队版本 '+base.version:'尚未配置，保持来源顺序'}{base.updatedBy?' · '+base.updatedBy:''}{!canEdit?' · 当前只读':''}</p>
    {read.error&&<p role="alert">最新设置暂不可读取，已暂停修改；不会回退到浏览器设置。</p>}
    {read.settings&&read.settings.version>base.version&&<p role="status">其他人已更新团队设置；你的输入已保留。<Button variant="text" disabled={saving||Boolean(pending)} onClick={reload}>放弃本次修改并读取最新</Button></p>}
    {canEdit&&<div className="sp-keyword-add"><label htmlFor="trim-priority-keyword">包含关键词</label><input id="trim-priority-keyword" className="qc-control" value={keyword} maxLength={80} disabled={saving||Boolean(pending)} placeholder="例如：线、拉链" onChange={event=>setKeyword(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add();}}}/><Button variant="secondary" onClick={add} disabled={saving||Boolean(pending)||!keyword.trim()}>添加</Button></div>}
    <ol className="sp-keyword-list" aria-label="辅料关键词优先级">{draft.map((value,index)=><li key={value}><span className="sp-keyword-rank">{index+1}</span><strong>{value}</strong>{canEdit&&<div><Button variant="text" size="compact" aria-label={'上移 '+value} disabled={saving||Boolean(pending)||index===0} onClick={()=>move(index,-1)}>上移</Button><Button variant="text" size="compact" aria-label={'下移 '+value} disabled={saving||Boolean(pending)||index===draft.length-1} onClick={()=>move(index,1)}>下移</Button><Button variant="text" size="compact" aria-label={'删除 '+value} disabled={saving||Boolean(pending)} onClick={()=>setDraft(items=>items.filter((_,i)=>i!==index))}>删除</Button></div>}</li>)}</ol>
    {!draft.length&&<p>暂无优先级关键词。</p>}
    <div className="sp-settings-actions">{canEdit&&<Button onClick={()=>void save()} disabled={saving||Boolean(keyword.trim())||!dirty&&!pending}>{saving?'保存中…':pending?'用原请求重试':'保存排列'}</Button>}<Button variant="secondary" onClick={()=>navigate(back)}>返回物料</Button></div>
   </>}
   {message&&<p role="status">{message}</p>}{pending&&!saving&&<p role="alert">保存结果待确认，输入已锁定。请用原请求重试，避免覆盖他人的新设置。</p>}
  </Card>
  <Modal open={departure!==null} title={pending?'排序保存结果待确认':'辅料排列有未保存修改'} description={pending?'离开后可以重新读取团队当前设置；本次请求结果仍可能已保存。':'离开后，本次未保存的排列会丢失。'} onClose={()=>{if(!saving)setDeparture(null);}} footer={<><Button variant="secondary" disabled={saving} onClick={()=>setDeparture(null)}>继续编辑</Button><Button variant="danger" disabled={saving} onClick={()=>void leave()}>放弃并离开</Button></>}><p>已保存的团队设置不会被删除。</p></Modal>
 </PageContainer></AppShell>;
}
export function MaterialProgressSettingsPage(){const session=useServerSession();if(quoteAuthority()!=='server')return <p>此设置仅在正式Server物料页面可用，不读取Browser设置。</p>;if(session.status==='authenticated'&&session.hasPermission('order.view')&&session.hasPermission('style_progress.read'))return <SettingsBody key={session.user?.id+'/'+session.permissions.join('|')}/>;return <AppShell title="进度设置" identityMode="server"><PageContainer>{session.status==='anonymous'?<ServerLoginCard/>:session.status==='authenticated'?<p role="alert">没有物料查看权限。</p>:<p>确认登录状态…</p>}</PageContainer></AppShell>;}
