import { useMemo } from "react";
const router={push:(href:string)=>location.assign(href),replace:(href:string)=>location.replace(href),back:()=>history.back(),refresh:()=>location.reload(),prefetch:()=>undefined};
export function useRouter(){return router;}
export function usePathname(){return location.pathname;}
export function useSearchParams(){return useMemo(()=>new URLSearchParams(location.search),[]);}
