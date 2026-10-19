"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@/components/foundation";
import type { OperationLog } from "../model/operation-log";
import { groupOperationLogs } from "../model/operation-log-presentation";
import { operationLogRepository } from "../repository/operation-log-repository";
import { OperationLogGroupList } from "./operation-log-group-list";
import { ServerOperationLogViewer } from "./server-operation-log-viewer";

function BrowserOperationLogModal({ open, quoteId, onClose }: { open: boolean; quoteId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const groups = useMemo(() => groupOperationLogs(logs), [logs]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoading(true);
      return operationLogRepository.listByQuoteId(quoteId);
    }).then((items) => { if (active) setLogs(items); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, quoteId]);

  return <Modal open={open} className="qc-operation-log-modal" title="操作记录" description="按一次业务操作聚合展示；历史日志不可编辑或删除。" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    {loading ? <div className="qc-operation-log-empty">正在载入操作记录…</div> : <OperationLogGroupList groups={groups} compact />}
  </Modal>;
}
export function OperationLogModal(props:{open:boolean;quoteId:string;onClose:()=>void;serverMode?:boolean}){
  if(props.serverMode)return <Modal open={props.open} title="操作记录" className="qc-operation-log-modal" description="查看这份报价的操作与修改记录。" onClose={props.onClose} footer={<Button onClick={props.onClose}>关闭</Button>}>{props.open&&<ServerOperationLogViewer quoteId={props.quoteId} />}</Modal>;
  return <BrowserOperationLogModal {...props} />;
}
