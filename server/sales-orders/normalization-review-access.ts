import type {PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {HttpError} from '../http/errors.js';
import {permissionsForUser,requirePermission} from '../auth/permissions.js';
import {requireOrderCommandActor} from './identity-service.js';
import {normalizationHash} from './normalization-execution-model.js';
export const NORMALIZATION_REVIEW_ROLES={production:'role-team-production-manager',finance:'role-team-finance-manager'} as const;
export type NormalizationReviewType=keyof typeof NORMALIZATION_REVIEW_ROLES;
/** Real current bindings only. Cached actor permissions and legacy role names are not authority. */
export async function readNormalizationReviewAccess(client:PoolClient,actor:TrustedIdentity,required=false){
 const user=(await client.query('SELECT active,public_id::text FROM app_users WHERE id=$1',[actor.internalUserId])).rows[0];
 if(!user?.active||user.public_id!==actor.userId)throw new HttpError(401,'authentication_required','Authentication required');
 const permissions=await permissionsForUser(client,actor.internalUserId);requirePermission(permissions,'order.view');
 const roles=new Set((await client.query<{role_id:string}>('SELECT role_id FROM app_user_roles WHERE user_id=$1',[actor.internalUserId])).rows.map(row=>row.role_id));
 const reviewTypes=(Object.keys(NORMALIZATION_REVIEW_ROLES) as NormalizationReviewType[]).filter(type=>roles.has(NORMALIZATION_REVIEW_ROLES[type]));
 const canPublish=roles.has('role-server-admin'),available=canPublish||reviewTypes.length>0;
 if(required&&!available)throw new HttpError(403,'normalization_review_role_required','Trusted normalization role required');
 return {available,canPublish,reviewTypes};
}
export async function normalizationReviewerFingerprint(client:PoolClient,actor:TrustedIdentity,type:NormalizationReviewType,lock=false){
 const binding=(await client.query('SELECT user_id::text,role_id,xmin::text AS revision FROM app_user_roles WHERE user_id=$1 AND role_id=$2'+(lock?' FOR SHARE':''),[actor.internalUserId,NORMALIZATION_REVIEW_ROLES[type]])).rows[0];
 if(!binding)throw new HttpError(403,'normalization_review_role_required','Trusted reviewer role required');
 const user=(await client.query('SELECT public_id::text,active,xmin::text AS revision FROM app_users WHERE id=$1',[actor.internalUserId])).rows[0];
 if(!user?.active||user.public_id!==actor.userId)throw new HttpError(401,'authentication_required','Authentication required');
 const grants=(await client.query("SELECT ur.role_id,ur.xmin::text AS binding_revision,rp.xmin::text AS grant_revision FROM app_user_roles ur JOIN app_role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=$1 AND rp.permission_key='order.view' ORDER BY ur.role_id",[actor.internalUserId])).rows;
 if(!grants.length)throw new HttpError(403,'permission_denied','Order view required');
 return normalizationHash({user,binding,grants});
}
export async function requireNormalizationReviewer(client:PoolClient,actor:TrustedIdentity,type:NormalizationReviewType){
 const current=await requireOrderCommandActor(client,actor,'order.view');
 return {...current,authorizationFingerprint:await normalizationReviewerFingerprint(client,current,type,true)};
}
