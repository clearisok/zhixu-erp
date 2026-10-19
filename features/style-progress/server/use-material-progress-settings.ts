"use client";
import {useEffect,useState} from 'react';
import {useServerSession} from '@/features/server-auth';
import {materialProgressSettingsClient} from './material-progress-settings-client';
import type {MaterialProgressSettings} from '../model/material-display-order';
export function useMaterialProgressSettings(){
 const session=useServerSession(),scope=(session.user?.id??'')+'/'+session.status+'/'+session.permissions.join('|');
 const [state,setState]=useState<{scope:string;settings:MaterialProgressSettings|null;error:boolean;loading:boolean}>({scope,settings:null,error:false,loading:true});
 const [generation,setGeneration]=useState(0);
 useEffect(()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let pending=false;
  const read=async()=>{if(pending||controller.signal.aborted||session.status!=='authenticated')return;clearTimeout(timer);pending=true;try{const settings=await materialProgressSettingsClient.read(controller.signal);if(!controller.signal.aborted)setState({scope,settings,error:false,loading:false});}catch{if(!controller.signal.aborted)setState({scope,settings:null,error:true,loading:false});}finally{pending=false;if(!controller.signal.aborted)timer=setTimeout(()=>{if(document.visibilityState==='visible')void read();else timer=setTimeout(visible,30000);},30000);}};
  const visible=()=>{if(document.visibilityState==='visible')void read();};void read();window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{controller.abort();clearTimeout(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[scope,generation,session.status]);
 return {settings:state.scope===scope?state.settings:null,error:state.scope===scope&&state.error,loading:state.scope!==scope||state.loading,reload:()=>setGeneration(value=>value+1)};
}
