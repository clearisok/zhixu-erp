import {ServerRolePage} from "@/features/permissions/components/server-role-page";
import {quoteAuthority} from "@/features/quote-center/authority/quote-authority";
export default function Page(){return quoteAuthority()==="server"?<ServerRolePage/>:<p>角色管理仅在服务器模式开放。</p>;}

