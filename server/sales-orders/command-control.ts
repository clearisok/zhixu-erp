import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {permissionsForUser,requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';

export type OrderCommandMode='enabled'|'frozen';
export function parseOrderCommandMode(value:string|undefined):OrderCommandMode{
 if(value===undefined||value==='enabled')return 'enabled';
 if(value==='frozen')return 'frozen';
 throw new Error('ZHIXU_ORDER_COMMAND_MODE must be enabled or frozen');
}
export function orderCommandControlError(error:unknown):unknown{
 const failure=error as {code?:string;message?:string};
 if(failure?.code==='55000'&&['order_commands_frozen','order_command_control_unavailable'].includes(failure.message??''))
  return new HttpError(503,failure.message!,failure.message==='order_commands_frozen'?'New order, price adoption and normalization commands are paused':'Order command control is unavailable');
 return error;
}
/** Fresh read-only authorization; runtime can restrict, never reopen a DB pause. */
export async function readOrderCommandState(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,runtime:OrderCommandMode){
 parseOrderCommandMode(runtime);
 const client=await pool.connect();try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const actor=(await client.query('SELECT id::text FROM app_users WHERE id=$1 AND public_id=$2 AND active=true',[identity.internalUserId,identity.userId])).rows[0];
  if(!actor)throw new HttpError(401,'authentication_required','Authentication required');
  requirePermission(await permissionsForUser(client,actor.id),'order.view');
  const schema=(await client.query("SELECT to_regclass('public.sales_order_command_control') IS NOT NULL AND to_regclass('public.sales_order_command_control_events') IS NOT NULL AND to_regprocedure('require_order_commands_enabled()') IS NOT NULL AS available")).rows[0];
  if(!schema.available)throw new HttpError(503,'order_command_control_unavailable','Order command control is unavailable');
  const row=(await client.query<{mode:OrderCommandMode;version:number}>('SELECT mode,version FROM sales_order_command_control WHERE singleton')).rows[0];
  if(!row||!['enabled','frozen'].includes(row.mode))throw new HttpError(503,'order_command_control_unavailable','Order command control is unavailable');
  await client.query('COMMIT');
  return {mode:runtime==='frozen'||row.mode==='frozen'?'frozen' as const:'enabled' as const,runtimeMode:runtime,databaseMode:row.mode,databaseVersion:row.version};
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
}
export async function assertOrderCommandsAvailable(pool:Pool,identity:Pick<TrustedIdentity,'internalUserId'|'userId'>,runtime:OrderCommandMode){
 const state=await readOrderCommandState(pool,identity,runtime);
 if(state.mode==='frozen')throw new HttpError(503,'order_commands_frozen','New order, price adoption and normalization commands are paused');
}
