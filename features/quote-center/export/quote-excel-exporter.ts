import type { AttachmentRepository } from "../repository/attachment-repository.ts";
import type { QuoteRevision } from "../model/quote-view-model.ts";
import { BUILTIN_FORMAL_TEMPLATE, getDefaultQuoteCustomerTemplate } from "../../template-settings/repository/indexeddb-template-repository.ts";
import type { TemplateDefinition } from "../../template-settings/model/template-definition.ts";
import { buildQuoteExcel, type QuoteExcelBuildInput, type QuoteExcelBuildResult, type QuoteExcelImage } from "./quote-excel-core.ts";
export { buildQuoteExcel } from "./quote-excel-core.ts";
export type { QuoteExcelBuildInput, QuoteExcelBuildResult, QuoteExcelImage } from "./quote-excel-core.ts";

const TEMPLATE_URL = new URL("../../../templates/quote-export-template-v1.xlsx", import.meta.url);

export type BrowserExportInput = Omit<QuoteExcelBuildInput, "template" | "styleImage"> & {
  attachmentRepository: AttachmentRepository;
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取款式图失败"));
    reader.readAsDataURL(blob);
  });
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法解析款式图尺寸")); };
    image.src = url;
  });
}

async function convertWebpToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("当前浏览器无法转换 WEBP 款式图"); }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((png) => png ? resolve(png) : reject(new Error("WEBP 款式图转换失败")), "image/png"));
}

export async function loadStyleImage(revision: QuoteRevision, repository: AttachmentRepository): Promise<{ image: QuoteExcelImage | null; warnings: string[] }> {
  if (!revision.styleImageAttachmentId) return { image: null, warnings: [] };
  try {
    const attachment = await repository.get(revision.styleImageAttachmentId);
    const originalBlob = await repository.getBlob(revision.styleImageAttachmentId);
    if (!attachment || !originalBlob) return { image: null, warnings: ["款式图附件不可用，Excel 款式图区已留空"] };
    const isWebp = attachment.mimeType === "image/webp" || /\.webp$/i.test(attachment.name);
    const blob = isWebp ? await convertWebpToPng(originalBlob) : originalBlob;
    const dimensions = await imageDimensions(blob);
    const isPng =
      blob.type === "image/png" || attachment.mimeType === "image/png" || /\.png$/i.test(attachment.name);
    const extension: QuoteExcelImage["extension"] = isWebp || isPng ? "png" : "jpeg";
    return { image: { base64: await blobToDataUrl(blob), extension, ...dimensions }, warnings: [] };
  } catch (error) {
    console.warn("Quote Excel style image warning", error);
    return { image: null, warnings: ["款式图附件不可用，Excel 款式图区已留空"] };
  }
}

export async function buildDefaultQuoteRevisionExcel(input: BrowserExportInput): Promise<QuoteExcelBuildResult> {
  let selected: Awaited<ReturnType<typeof getDefaultQuoteCustomerTemplate>>;
  try { selected = await getDefaultQuoteCustomerTemplate(); }
  catch {
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) throw new Error(`无法读取正式报价模板（${response.status}）`);
    selected = { definition: BUILTIN_FORMAL_TEMPLATE, buffer: await response.arrayBuffer() };
  }
  return buildQuoteRevisionExcelWithTemplate(input, selected.definition, selected.buffer);
}

export async function buildQuoteRevisionExcelWithTemplate(input: BrowserExportInput, definition: TemplateDefinition, template: ArrayBuffer): Promise<QuoteExcelBuildResult> {
  const styleImage = await loadStyleImage(input.revision, input.attachmentRepository);
  const result = definition.id === BUILTIN_FORMAL_TEMPLATE.id
    ? await buildQuoteExcel({ ...input, template, styleImage: styleImage.image })
    : await (await import("./quote-placeholder-excel-exporter.ts")).buildQuotePlaceholderExcel({ ...input, template, styleImage: styleImage.image });
  return { ...result, warnings: [...result.warnings, ...styleImage.warnings] };
}

export async function exportQuoteRevisionExcel(input: BrowserExportInput): Promise<QuoteExcelBuildResult> {
  const result = await buildDefaultQuoteRevisionExcel(input);
  const blob = new Blob([result.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return result;
}
