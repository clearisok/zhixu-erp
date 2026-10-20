/** Runs before the router captures History methods. No business data or storage. */
export const serverNavigationHistoryScript = `(()=>{
  if(window.__zhixuWorkspaceHistory)return;
  const key='__zhixuWorkspaceNavigation',h=window.history;
  const push=h.pushState.bind(h),replace=h.replaceState.bind(h);
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const tracker={epoch:String(Date.now())+':'+Math.random(),index:0,href:location.href};
  window.__zhixuWorkspaceHistory=tracker;
  const mark=()=>({epoch:tracker.epoch,index:tracker.index});
  h.pushState=function(data,unused,url){
    const index=tracker.index+1;
    const value=data==null||object(data)?{...(data??{}),[key]:{epoch:tracker.epoch,index}}:data;
    push(value,unused,url);tracker.index=index;tracker.href=location.href;
  };
  h.replaceState=function(data,unused,url){
    const value=data==null||object(data)?{...(data??{}),[key]:mark()}:data;
    replace(value,unused,url);tracker.href=location.href;
  };
  h.replaceState(h.state,'',location.href);
  window.addEventListener('popstate',event=>{
    let value=h.state?.[key];
    const oldUrl=new URL(tracker.href),nextUrl=new URL(location.href);
    if(value?.epoch===tracker.epoch&&value.index===tracker.index&&oldUrl.pathname+oldUrl.search===nextUrl.pathname+nextUrl.search&&oldUrl.href!==nextUrl.href){
      value={epoch:tracker.epoch,index:tracker.index+1};replace({...h.state,[key]:value},'',location.href);
    }
    tracker.onPop?.(event);
    if(event.cancelBubble)return;
    value=h.state?.[key];
    if(value?.epoch===tracker.epoch&&Number.isSafeInteger(value.index)){tracker.index=value.index;tracker.href=location.href;}
  });
  window.addEventListener('hashchange',()=>{
    const value=h.state?.[key];
    if(value?.epoch===tracker.epoch&&Number.isSafeInteger(value.index)){tracker.index=value.index;tracker.href=location.href;}
    else{tracker.index++;h.replaceState(h.state,'',location.href);}
  });
})();`;

export type WorkspaceHistory = { epoch: string; index: number; href: string; onPop?: (event: PopStateEvent) => void };
export const workspaceHistoryKey = "__zhixuWorkspaceNavigation";
