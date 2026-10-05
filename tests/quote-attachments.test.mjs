import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Q4B shares one panel; production Browser keeps IndexedDB controller and only isolated writer injects Server controller", async () => {
  const [panel, browserController, editor, writer] = await Promise.all([
    readFile(new URL("../features/quote-center/components/attachment-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/quote-center/model/quote-attachment-controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/quote-center/components/server-quote-writer-page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /controller = browserQuoteAttachmentController/u);
  assert.match(browserController, /indexedDbAttachmentRepository/u);
  assert.match(editor, /<QuoteAttachmentPanel/u);
  assert.doesNotMatch(editor, /createServerQuoteAttachmentController/u);
  assert.match(writer, /<QuoteAttachmentPanel/u);
  assert.match(writer, /createServerQuoteAttachmentController/u);
  assert.match(panel, /URL\.createObjectURL/u);
  assert.match(panel, /URL\.revokeObjectURL/u);
});

import {
  addAttachmentToRevision,
  adjacentPreviewAttachmentId,
  attachmentNeedsDeleteConfirmation,
  canPreviewAttachment,
  createPastedImageFileName,
  imageFilesFromDrop,
  pastedImageFileFromClipboard,
  pastedImageFilesFromClipboard,
  removeAttachmentFromRevision,
  setRevisionStyleImage,
} from "../features/quote-center/model/quote-attachments.ts";
import { saveQuoteAttachments } from "../features/quote-center/model/quote-attachment-upload.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";
import { createRevisionFromSnapshot } from "../features/quote-center/model/quote-workflows.ts";

function attachment(id, kind = "image") {
  return {
    id,
    name: `${id}.${kind === "image" ? "jpg" : "xlsx"}`,
    mimeType: kind === "image" ? "image/jpeg" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 2048,
    kind,
    storageKey: `attachments/${id}`,
    createdAt: "2026-08-21T12:00:00Z",
    createdBy: "Alice",
  };
}

function revision() {
  return getDefaultRevision(createQuoteDraft("attachment-test", "QT-ATTACHMENT", "2026-08-21"));
}

test("上传第一张图片自动成为款式图，第二张不会覆盖", () => {
  const first = addAttachmentToRevision(revision(), attachment("IMG-001"));
  assert.deepEqual(first.imageAttachmentIds, ["IMG-001"]);
  assert.equal(first.styleImageAttachmentId, "IMG-001");
  const second = addAttachmentToRevision(first, attachment("IMG-002"));
  assert.deepEqual(second.imageAttachmentIds, ["IMG-001", "IMG-002"]);
  assert.equal(second.styleImageAttachmentId, "IMG-001");
});

test("可以切换款式图，且只能引用当前 Revision 的图片", () => {
  let current = addAttachmentToRevision(revision(), attachment("IMG-001"));
  current = addAttachmentToRevision(current, attachment("IMG-002"));
  assert.equal(setRevisionStyleImage(current, "IMG-002").styleImageAttachmentId, "IMG-002");
  assert.throws(() => setRevisionStyleImage(current, "IMG-999"), /当前报价版本中的图片/);
});

test("删除普通图片不影响款式图，删除款式图需要确认并清空引用", () => {
  let current = addAttachmentToRevision(revision(), attachment("IMG-001"));
  current = addAttachmentToRevision(current, attachment("IMG-002"));
  assert.equal(attachmentNeedsDeleteConfirmation(current, "IMG-002"), false);
  const withoutSecond = removeAttachmentFromRevision(current, "IMG-002");
  assert.equal(withoutSecond.styleImageAttachmentId, "IMG-001");
  assert.equal(attachmentNeedsDeleteConfirmation(withoutSecond, "IMG-001"), true);
  const withoutStyle = removeAttachmentFromRevision(withoutSecond, "IMG-001");
  assert.equal(withoutStyle.styleImageAttachmentId, null);
  assert.deepEqual(withoutStyle.imageAttachmentIds, []);
});

test("图片预览支持循环上一张和下一张", () => {
  const ids = ["IMG-001", "IMG-002", "IMG-003"];
  assert.equal(adjacentPreviewAttachmentId(ids, "IMG-002", 1), "IMG-003");
  assert.equal(adjacentPreviewAttachmentId(ids, "IMG-003", 1), "IMG-001");
  assert.equal(adjacentPreviewAttachmentId(ids, "IMG-001", -1), "IMG-003");
});

test("文件附件只支持下载，不属于在线预览类型", () => {
  assert.equal(canPreviewAttachment(attachment("IMG-001")), true);
  assert.equal(canPreviewAttachment(attachment("FILE-001", "file")), false);
});

test("新 Revision 复制附件引用，新版本新增附件不污染旧版本", () => {
  const quote = createQuoteDraft("attachment-revision", "QT-ATTACHMENT-REV", "2026-08-21");
  const source = getDefaultRevision(quote);
  const withImage = addAttachmentToRevision(source, attachment("IMG-001"));
  quote.revisions[0] = withImage;
  const nextQuote = createRevisionFromSnapshot(quote, {
    sourceRevisionId: withImage.revisionId,
    reason: "基础信息调整",
    note: "附件测试",
    createdBy: "Alice",
    nowIso: "2026-08-21T13:00:00Z",
    revisionId: "attachment-v2",
  });
  const oldRevision = nextQuote.revisions.find((item) => item.revisionId === withImage.revisionId);
  const nextRevision = getDefaultRevision(nextQuote);
  assert.deepEqual(nextRevision.imageAttachmentIds, ["IMG-001"]);
  assert.notEqual(nextRevision.imageAttachmentIds, oldRevision.imageAttachmentIds);
  const withNewImage = addAttachmentToRevision(nextRevision, attachment("IMG-002"));
  assert.deepEqual(withNewImage.imageAttachmentIds, ["IMG-001", "IMG-002"]);
  assert.deepEqual(oldRevision.imageAttachmentIds, ["IMG-001"]);
});

test("历史 Revision 不允许修改附件关系", () => {
  const quote = createQuoteDraft("attachment-readonly", "QT-READONLY", "2026-08-21");
  const source = getDefaultRevision(quote);
  const nextQuote = createRevisionFromSnapshot(quote, {
    sourceRevisionId: source.revisionId,
    reason: "其他",
    note: "只读测试",
    createdBy: "Alice",
    nowIso: "2026-08-21T13:00:00Z",
    revisionId: "attachment-readonly-v2",
  });
  const historical = nextQuote.revisions.find((item) => item.revisionId === source.revisionId);
  assert.equal(historical.readOnly, true);
  assert.throws(() => addAttachmentToRevision(historical, attachment("IMG-003")), /历史报价版本附件只读/);
  assert.throws(() => removeAttachmentFromRevision(historical, "IMG-001"), /历史报价版本附件只读/);
});

test("二进制附件使用 IndexedDB repository，不写入 localStorage 或 sessionStorage", async () => {
  const repository = await readFile(new URL("../features/quote-center/repository/indexeddb-attachment-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /indexedDB\.open/);
  assert.match(repository, /blob:\s*file/);
  assert.doesNotMatch(repository, /localStorage|sessionStorage|readAsDataURL|base64/i);
});

test("附件 UI 只有图片 Preview，文件列表仅提供下载和删除", async () => {
  const panel = await readFile(new URL("../features/quote-center/components/attachment-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /AttachmentPreviewModal/);
  assert.match(panel, /上传图片/);
  assert.match(panel, /上传文件/);
  assert.match(panel, /下载/);
  assert.doesNotMatch(panel, /PDF Viewer|Word Preview|Excel Preview|视频预览/);
});

test("附件 Card 固定在其他费用之后，并保持为最后一个业务 Card", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const page = editor.slice(editor.indexOf('return <AppShell title={isNew ? "新建报价"'));
  const orderedSections = [
    "<FabricCostTable",
    "<TrimCostTable",
    'className="qc-labor-card"',
    '<CostTable title="其他费用"',
    "<QuoteAttachmentPanel",
  ];
  let previousIndex = -1;
  for (const section of orderedSections) {
    const currentIndex = page.indexOf(section);
    assert.ok(currentIndex > previousIndex, `${section} 应位于前一个业务区域之后`);
    previousIndex = currentIndex;
  }
  assert.ok(page.indexOf("</fieldset>") < page.indexOf("<QuoteAttachmentPanel"), "附件必须位于成本只读 fieldset 之外，确保历史版本仍可预览和下载");
  assert.ok(page.indexOf("</FormShell>") > page.indexOf("<QuoteAttachmentPanel"), "附件必须是表单内最后一个业务 Card");
});

test("粘贴图片生成唯一文件名并通过 AttachmentRepository 保存", async () => {
  const now = new Date(2026, 7, 22, 9, 8, 7);
  const source = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
  const item = { kind: "file", type: "image/png", getAsFile: () => source };
  const pasted = pastedImageFileFromClipboard([item], ["pasted-image-20260822-090807-001.png"], now);
  assert.equal(pasted.name, "pasted-image-20260822-090807-002.png");
  assert.equal(createPastedImageFileName("image/jpeg", now), "pasted-image-20260822-090807-001.jpg");

  const savedFiles = [];
  const repository = {
    async save(file, input) {
      savedFiles.push(file);
      return { ...input, name: file.name, mimeType: file.type, size: file.size, storageKey: `attachments/${input.id}` };
    },
    async get() { return null; },
    async list() { return []; },
    async getBlob() { return null; },
    async delete() {},
  };
  const result = await saveQuoteAttachments({ revision: revision(), files: [pasted], kind: "image", repository, createdBy: "Alice", now: () => now });
  assert.equal(savedFiles.length, 1);
  assert.equal(result.attachments.length, 1);
  assert.equal(result.revision.imageAttachmentIds[0], result.attachments[0].id);
  assert.equal(result.revision.styleImageAttachmentId, result.attachments[0].id);
});

test("已有款式图时粘贴图片不会覆盖，非图片 Clipboard 不创建文件", async () => {
  const current = addAttachmentToRevision(revision(), attachment("IMG-EXISTING"));
  const pasted = new File([new Uint8Array([4])], "pasted-image.png", { type: "image/png" });
  const repository = {
    async save(file, input) { return { ...input, name: file.name, mimeType: file.type, size: file.size, storageKey: `attachments/${input.id}` }; },
    async get() { return null; }, async list() { return []; }, async getBlob() { return null; }, async delete() {},
  };
  const result = await saveQuoteAttachments({ revision: current, files: [pasted], kind: "image", repository, createdBy: "Alice" });
  assert.equal(result.revision.styleImageAttachmentId, "IMG-EXISTING");
  assert.equal(pastedImageFileFromClipboard([{ kind: "string", type: "text/plain", getAsFile: () => null }]), null);
});

test("R1-R5 批量 Clipboard 与 Drop 会收集全部图片并保证批次文件名唯一", () => {
  const now = new Date(2026, 7, 22, 10, 11, 12);
  const clipboardItems = ["png", "jpeg", "webp"].map((extension) => {
    const type = extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    const file = new File([new Uint8Array([1])], `clipboard.${extension}`, { type });
    return { kind: "file", type, getAsFile: () => file };
  });
  const firstPaste = pastedImageFilesFromClipboard(clipboardItems, [], now);
  assert.deepEqual(firstPaste.map((file) => file.name), [
    "pasted-image-20260822-101112-001.png",
    "pasted-image-20260822-101112-001.jpg",
    "pasted-image-20260822-101112-001.webp",
  ]);
  const secondPaste = pastedImageFilesFromClipboard(clipboardItems.slice(0, 1), firstPaste.map((file) => file.name), now);
  assert.equal(secondPaste[0].name, "pasted-image-20260822-101112-002.png");

  const dropped = imageFilesFromDrop([
    ...firstPaste,
    new File([new Uint8Array([2])], "报价.pdf", { type: "application/pdf" }),
  ]);
  assert.equal(dropped.images.length, 3);
  assert.equal(dropped.rejected.length, 1);
});

test("R8/R13/R14 批量确认统一写入 Revision，首张成为款式图且不覆盖已有款式图", async () => {
  const files = Array.from({ length: 4 }, (_, index) => new File([new Uint8Array([index])], `batch-${index + 1}.png`, { type: "image/png" }));
  const repository = {
    async save(file, input) { return { ...input, name: file.name, mimeType: file.type, size: file.size, storageKey: `attachments/${input.id}` }; },
    async get() { return null; }, async list() { return []; }, async getBlob() { return null; }, async delete() {},
  };
  const fresh = await saveQuoteAttachments({ revision: revision(), files, kind: "image", repository, createdBy: "Alice" });
  assert.equal(fresh.attachments.length, 4);
  assert.deepEqual(fresh.revision.imageAttachmentIds, fresh.attachments.map((item) => item.id));
  assert.equal(fresh.revision.styleImageAttachmentId, fresh.attachments[0].id);

  const withStyle = addAttachmentToRevision(revision(), attachment("IMG-EXISTING"));
  const appended = await saveQuoteAttachments({ revision: withStyle, files, kind: "image", repository, createdBy: "Alice" });
  assert.equal(appended.revision.styleImageAttachmentId, "IMG-EXISTING");
});

test("批量保存中途失败会回滚本批次已保存 Blob，不返回半成品 Revision", async () => {
  const deleted = [];
  let saves = 0;
  const repository = {
    async save(file, input) {
      saves += 1;
      if (saves === 3) throw new Error("模拟保存失败");
      return { ...input, name: file.name, mimeType: file.type, size: file.size, storageKey: `attachments/${input.id}` };
    },
    async get() { return null; }, async list() { return []; }, async getBlob() { return null; }, async delete(id) { deleted.push(id); },
  };
  const files = Array.from({ length: 3 }, (_, index) => new File([new Uint8Array([index])], `rollback-${index}.png`, { type: "image/png" }));
  await assert.rejects(saveQuoteAttachments({ revision: revision(), files, kind: "image", repository, createdBy: "Alice" }), /模拟保存失败/);
  assert.equal(deleted.length, 2);
});

test("图片粘贴区获得焦点后直接保存多图，不再经过 Paste Modal", async () => {
  const panel = await readFile(new URL("../features/quote-center/components/attachment-panel.tsx", import.meta.url), "utf8");
  assert.match(panel, /className=\{`qc-direct-paste-area/);
  assert.match(panel, /onPaste=\{\(event\) => void pasteImage\(event\)\}/);
  assert.match(panel, /onDrop=\{\(event\) => void dropImages\(event\)\}/);
  assert.match(panel, /onDragEnter=\{enterPasteArea\}/);
  assert.match(panel, /saveAttachments\("image", files\)/);
  assert.doesNotMatch(panel, /pendingImages|pasteOpen|confirmPendingImages|qc-paste-image-modal/);
  assert.doesNotMatch(panel, /document\.addEventListener\(["'](?:paste|drop|dragover)/);
});

test("粘贴监听仅绑定 Paste Area，预览使用 contain 且 Footer 文案不会收缩隐藏", async () => {
  const panel = await readFile(new URL("../features/quote-center/components/attachment-panel.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/quote-center/quote-center.css", import.meta.url), "utf8");
  const previewCss = css.slice(css.indexOf(".qc-attachment-preview-modal"), css.indexOf("@media (max-width: 620px)", css.indexOf(".qc-attachment-preview-modal")));
  assert.match(panel, /直接 Ctrl \+ V/);
  assert.match(panel, /onPaste=\{\(event\) => void pasteImage\(event\)\}/);
  assert.doesNotMatch(panel, /document\.addEventListener\(["']paste/);
  assert.match(panel, />上一张<\/Button>/);
  assert.match(panel, />下一张<\/Button>/);
  assert.match(panel, />下载<\/Button>/);
  assert.match(previewCss, /object-fit:\s*contain/);
  assert.match(previewCss, /--qc-green:\s*#175c4b/);
  assert.doesNotMatch(previewCss, /object-fit:\s*cover/);
  assert.match(previewCss, /min-height:\s*0/);
  assert.match(previewCss, /flex-wrap:\s*wrap/);
  assert.match(previewCss, /flex:\s*0 0 auto/);
  assert.match(previewCss, /overflow:\s*visible/);
});
