"use client";

import { useEffect, useState } from "react";
import { AppShell, Button, Card, FormItem, Modal, PageContainer, PageHeader, SearchableSelect, StatusTag } from "@/components/foundation";
import { QUOTE_CUSTOMER_PLACEHOLDER_GROUPS, validateQuoteCustomerTemplate, type TemplateDefinition } from "../model/template-definition";
import { indexedDbTemplateRepository } from "../repository/indexeddb-template-repository";
import { mockQuoteRepository } from "../../quote-center/repository/mock-quote-repository";
import { getDefaultRevision } from "../../quote-center/model/quote-view-model";
import { buildQuoteRevisionExcelWithTemplate } from "../../quote-center/export/quote-excel-exporter";
import { indexedDbAttachmentRepository } from "../../quote-center/repository/indexeddb-attachment-repository";
import type { Quote } from "../../quote-center/model/quote-view-model";
import { PermissionButton, usePermissions } from "@/features/permissions";
import { createOperationLogDraft, operationLogRepository } from "@/features/operation-logs";

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function TemplateSettingsPage() {
  const { can, currentUser } = usePermissions();
  const [templates, setTemplates] = useState<TemplateDefinition[]>([]);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [name, setName] = useState("客户报价单模板");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [trialTemplate, setTrialTemplate] = useState<TemplateDefinition | null>(null);
  const [trialQuotes, setTrialQuotes] = useState<Quote[]>([]);
  const [trialQuoteId, setTrialQuoteId] = useState("");
  const reload = () => indexedDbTemplateRepository.list("quote_customer").then(setTemplates);
  useEffect(() => { void reload(); }, []);
  const run = async (id: string, task: () => Promise<void>) => {
    setBusyId(id); setMessage("");
    try { await task(); await reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusyId(""); }
  };
  const upload = async () => {
    if (!can("settings.template.edit")) return;
    if (!file || !name.trim()) { setMessage("请填写模板名称并选择 xlsx 文件"); return; }
    const buffer = await file.arrayBuffer();
    const validation = await validateQuoteCustomerTemplate(file.name, buffer);
    if (!validation.valid) { setMessage(validation.errors.join("；")); return; }
    const version = Math.max(0, ...templates.filter((item) => item.name === name.trim()).map((item) => item.version)) + 1;
    const now = new Date().toISOString();
    const templateId = `template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await indexedDbTemplateRepository.save({ id: templateId, type: "quote_customer", name: name.trim(), version, fileName: file.name, isDefault: false, enabled: true, createdAt: now, updatedAt: now, createdBy: currentUser.name }, file);
    await operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "模板设置", entityType: "Template", entityId: templateId, action: "上传模板", afterData: { values: { "模板名称": name.trim(), "版本": version, "文件": file.name } } }));
    setUploadOpen(false); setFile(null); setMessage(validation.warnings.join("；")); await reload();
  };
  const openTrialExport = async (definition: TemplateDefinition) => {
    setMessage("");
    const quotes = await mockQuoteRepository.list();
    if (!quotes.length) { setMessage("没有可用于试导出的报价"); return; }
    setTrialQuotes(quotes);
    setTrialQuoteId(quotes[0].id);
    setTrialTemplate(definition);
  };
  const trialExport = async () => {
    if (!trialTemplate) return;
    const quote = trialQuotes.find((item) => item.id === trialQuoteId);
    if (!quote) { setMessage("请选择一张测试报价"); return; }
    await run(trialTemplate.id, async () => {
    const blob = await indexedDbTemplateRepository.getBlob(trialTemplate.id);
    if (!blob) throw new Error("模板文件不可用");
    const revision = getDefaultRevision(quote);
    const result = await buildQuoteRevisionExcelWithTemplate({ quote, revision, priceVersions: revision.priceVersions, attachmentRepository: indexedDbAttachmentRepository }, trialTemplate, await blob.arrayBuffer());
    downloadBlob(new Blob([result.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `试导出-${result.fileName}`);
    setTrialTemplate(null);
    });
  };

  return <AppShell title="模板设置"><PageContainer>
    <PageHeader eyebrow="BASIC SETTINGS" title="模板设置" description="维护导出模板版本、默认模板与占位符字段；模板文件保存在当前浏览器 IndexedDB。" actions={<><Button variant="secondary" onClick={() => setFieldsOpen(true)}>支持字段</Button><PermissionButton permission="settings.template.edit" onClick={() => { setMessage(""); setUploadOpen(true); }}>＋ 创建模板版本</PermissionButton></>} />
    {message && <div className="qc-form-alert qc-template-message">{message}</div>}
    <Card className="qc-template-list-card">
      <div className="qc-template-list-head"><span>模板</span><span>类型</span><span>版本</span><span>状态</span><span>更新时间</span><span>操作</span></div>
      {templates.map((template) => <article key={template.id} className={!template.enabled ? "is-disabled" : ""}>
        <div><strong>{template.name}</strong><small>{template.fileName}</small></div><span>客户报价单</span><span>V{template.version}</span><span>{template.isDefault && <StatusTag tone="success">默认</StatusTag>}<StatusTag tone={template.enabled ? "active" : "neutral"}>{template.enabled ? "启用" : "停用"}</StatusTag></span><span>{new Date(template.updatedAt).toLocaleDateString("zh-CN")}</span>
        <div className="qc-template-actions">
          <Button variant="text" disabled={busyId === template.id} onClick={() => run(template.id, async () => { const blob = await indexedDbTemplateRepository.getBlob(template.id); if (!blob) throw new Error("模板文件不可用"); downloadBlob(blob, template.fileName); })}>下载</Button>
          <PermissionButton permission="settings.template.edit" variant="text" disabled={!template.enabled || template.isDefault || busyId === template.id} onClick={() => run(template.id, async () => { await indexedDbTemplateRepository.setDefault(template.id); await operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "模板设置", entityType: "Template", entityId: template.id, action: "设为默认模板", afterData: { values: { "模板名称": template.name, "版本": template.version } } })); })}>设为默认</PermissionButton>
          <Button variant="text" disabled={busyId === template.id} onClick={() => void openTrialExport(template)}>试导出</Button>
          <PermissionButton permission="settings.template.edit" variant="text" disabled={busyId === template.id} onClick={() => run(template.id, async () => { const now = new Date().toISOString(); const version = Math.max(...templates.filter((item) => item.name === template.name).map((item) => item.version)) + 1; await indexedDbTemplateRepository.copy(template.id, { ...template, id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, version, fileName: template.fileName.replace(/\.xlsx$/i, `-v${version}.xlsx`), isDefault: false, createdAt: now, updatedAt: now, createdBy: "当前用户" }); })}>复制</PermissionButton>
          {!template.builtIn && <PermissionButton permission="settings.template.edit" variant="text" disabled={busyId === template.id} onClick={() => run(template.id, async () => { await indexedDbTemplateRepository.setEnabled(template.id, !template.enabled); await operationLogRepository.append(createOperationLogDraft({ actor: { userId: currentUser.id, userName: currentUser.name }, module: "模板设置", entityType: "Template", entityId: template.id, action: "修改模板状态", beforeData: { values: { "状态": template.enabled ? "启用" : "停用" } }, afterData: { values: { "状态": template.enabled ? "停用" : "启用" } } })); })}>{template.enabled ? "停用" : "启用"}</PermissionButton>}
        </div>
      </article>)}
    </Card>
    <Modal open={uploadOpen} title="创建客户报价单模板版本" description="上传不会覆盖旧版本。系统会验证格式、占位符和动态行结构。" onClose={() => setUploadOpen(false)} onSubmit={upload} footer={<><Button variant="secondary" onClick={() => setUploadOpen(false)}>取消</Button><Button type="submit">验证并创建</Button></>}><div className="qc-modal-form"><FormItem label="模板名称" required><input className="qc-control" value={name} onChange={(event) => setName(event.target.value)} /></FormItem><FormItem label="Excel 模板" required><input className="qc-control qc-file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></FormItem>{message && <p className="qc-form-alert">{message}</p>}</div></Modal>
    <Modal open={fieldsOpen} className="qc-template-fields-modal" title="客户报价单支持字段" description="在 Excel 单元格中使用 {{字段名}}。面料、辅料、工价和其他费用字段所在行会被识别为动态重复行。" onClose={() => setFieldsOpen(false)} footer={<Button variant="secondary" onClick={() => setFieldsOpen(false)}>关闭</Button>}><div className="qc-template-field-groups">{QUOTE_CUSTOMER_PLACEHOLDER_GROUPS.map((group) => <section key={group.label}><strong>{group.label}</strong><div>{group.fields.map((field) => <code key={field}>{`{{${field}}}`}</code>)}</div></section>)}</div><p className="qc-form-alert">客户报价单禁止使用内部字段：{`{{estimate.*}}`}</p></Modal>
    <Modal open={Boolean(trialTemplate)} title="试导出客户报价单" description="选择一张现有报价作为测试数据；试导出与正式报价单使用同一导出器。" onClose={() => setTrialTemplate(null)} onSubmit={trialExport} footer={<><Button variant="secondary" onClick={() => setTrialTemplate(null)}>取消</Button><Button type="submit" disabled={!trialQuoteId || Boolean(busyId)}>确认试导出</Button></>}><FormItem label="测试报价" required><SearchableSelect value={trialQuoteId} options={trialQuotes.map((quote) => { const revision = getDefaultRevision(quote); return { value: quote.id, label: `${revision.baseInfo.quoteStyleNo || "未填写款号"} · ${revision.baseInfo.styleName || "未命名款式"}`, keywords: `${quote.quoteCode} ${revision.baseInfo.brandName}` }; })} onChange={(value) => setTrialQuoteId(value)} /></FormItem></Modal>
  </PageContainer></AppShell>;
}
