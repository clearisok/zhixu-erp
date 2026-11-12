import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {querySyncAudit} from './audit-query.js';
import ExcelJS from 'exceljs';

export async function routeSyncAudit(request:IncomingMessage,response:ServerResponse,deps:{pool:Pool;identityAuthority:{resolve:(request:IncomingMessage)=>Promise<TrustedIdentity|null>}}){
 const url=new URL(request.url??'/','http://localhost');
 if(!['/api/v1/ainuoke-sync-audit','/api/v1/ainuoke-sync-audit/export'].includes(url.pathname))return false;
 const actor=await deps.identityAuthority.resolve(request);if(!actor)throw new HttpError(401,'authentication_required','请先登录');
 requirePermission(actor.permissions,'ainuoke.view');requirePermission(actor.permissions,'audit_log.view');
 if(request.method!=='GET')throw new HttpError(405,'method_not_allowed','审计记录只读');
 const exporting=url.pathname.endsWith('/export'),result=await querySyncAudit(deps.pool,url.searchParams,exporting);
 response.setHeader('Cache-Control','no-store');
 if(!exporting){const body=JSON.stringify(result);response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});response.end(body);return true;}
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('同步明细');
 sheet.addRow(['批次ID','同步类型','批次状态','来源','报表ID','原始报表','目标表','销售合同','开始读取','获取完成','提交确认','源端更新时间','获取行数','新增','更新','未变化','失败','重复行','表状态','请求次数','分页数','重试次数','错误码','时间依据']);
 const iso=(v:unknown)=>v?new Date(String(v)).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'不可获取';
 for(const b of result.rows)for(const t of b.tables)sheet.addRow([b.id,b.sync_type,b.status,'艾诺科',t.report_id,t.source_name,t.target_tables.join('、'),t.contract_no,iso(t.read_started_at),iso(t.read_completed_at),iso(t.write_completed_at),iso(t.source_updated_at),t.fetched_count??'未知',t.inserted_count??'未知',t.updated_count??'未知',t.unchanged_count??'未知',t.failed_count??'未知',t.duplicate_count??'未知',t.status,t.api_requests??'未知',t.page_count??'未知',b.retry_count,t.error_code??b.error_code??'',t.read_time_basis]);
 sheet.views=[{state:'frozen',ySplit:1}];sheet.getRow(1).font={bold:true};sheet.columns.forEach(c=>{c.width=22;});
 const children=book.addWorksheet('逐合同处理');children.addRow(['批次ID','报表ID','销售合同','状态','获取行数','新增','更新','未变化','失败','提交确认','来源证据']);
 for(const b of result.rows)for(const t of b.contract_tables)children.addRow([b.id,t.report_id,t.contract_no,t.status,t.fetched_count??'未知',t.inserted_count??'未知',t.updated_count??'未知',t.unchanged_count??'未知',t.failed_count??'未知',iso(t.write_completed_at),JSON.stringify(t.cursor_info)]);
 const meta=book.addWorksheet('批次及计数说明');meta.addRow(['批次ID','原始任务开始','原始任务结束','历史参考时点','参考依据','台账记录时间','来源','计数口径']);
 for(const b of result.rows)meta.addRow([b.id,iso(b.started_at),iso(b.finished_at),iso(b.reference_at),b.reference_basis??'',iso(b.recorded_at),b.origin,'新增/更新/未变化为稳定来源记录的逻辑版本差异；不是物理快照行或交易数量；历史缺失值不推算']);
 const bytes=Buffer.from(await book.xlsx.writeBuffer());response.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="ainuoke-sync-audit.xlsx"','Content-Length':bytes.length});response.end(bytes);return true;
}
