import { useMemo, useSyncExternalStore } from "react";
const subscribe = (changed: () => void) => { window.addEventListener('popstate', changed); return () => window.removeEventListener('popstate', changed); };
const router={push:(href:string)=>location.assign(href),replace:(href:string)=>location.replace(href),back:()=>history.back(),refresh:()=>location.reload(),prefetch:()=>undefined};
export function useRouter(){return router;}
export function usePathname(){return location.pathname;}
export function useSearchParams(){const search=useSyncExternalStore(subscribe,()=>location.search,()=>"");return useMemo(()=>new URLSearchParams(search),[search]);}