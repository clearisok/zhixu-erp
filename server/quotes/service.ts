import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CreationInput } from "./creation-contract.js";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { requirePermission } from "../auth/permissions.js";
import { requireCommercialEdit } from "../confirmed-commercial-terms/permissions.js";
import { restoreRestrictedConfirmation } from "./commercial-save.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { QuoteConflictError, QuoteInvariantError, normalizeServerQuote, validateQuote, type QuoteRecord, type ServerQuote } from "./model.js";
import { projectQuoteResponse, type QuoteSaveContent } from "./quote-response.js";
import { restoreRestrictedQuoteCosts } from "./restricted-save.js";
import { createQuoteRepository, type QuoteMutationHook } from "./repository.js";
import { createServerQuoteDraft } from "./draft.js";
import { allocateQuoteCode } from "./numbering.js";
import { applyQuoteVersionCommand, type QuoteVersionCommand } from "./version-workflows.js";
import { applyEstimateCommand, type EstimateCommand } from "./estimate-workflows.js";
import { applyQuoteConfirmation, type QuoteConfirmationCommand } from "./confirmation-workflows.js";
import { findTermsByQuoteProvenance } from "../confirmed-commercial-terms/repository.js";
import { aggregateStatusAfterRevisionEdit, summarizeRevisionConfirmations } from "../../features/quote-center/model/quote-workflows.js";
import type { QuoteRevision } from "../../features/quote-center/model/quote-view-model.js";

/** Internal Q1 persistence/import foundation. It is not exposed by the runtime
 * Browser API; callers here preserve exact historical aggregate identities. */
export function createQuoteService(pool: Pool) {
  const repository = createQuoteRepository(pool);
  return { createAggregate: repository.create, saveAggregate: repository.save, getById: repository.getById, list: repository.list };
}

export type QuoteMutationContext = {
  requestId?: string;
  method?: string;
  path?: string;
  workflowAction?: string;
  revisionId?: string;
  priceVersionId?: string;
};

export type QuoteRuntimeDependencies = {
  now?: () => Date;
  randomUuid?: () => string;
};

function requireChangedPermission(
  actor: TrustedIdentity,
  permission: PermissionKey,
  before: unknown,
  after: unknown,
): void {
  if (!isDeepStrictEqual(before, after)) requirePermission(actor.permissions, permission);
}

function priceVersionById(revision: ServerQuote["revisions"][number], id: string) {
  return revision.priceVersions.find((version) => version.id === id);
}

/**
 * A full aggregate replacement can contain several independently permissioned
 * Quote operations. Keep the broad quote.edit gate, then enforce the existing
 * finer-grained permissions when those subdomains actually change.
 */
function authorizeReplacement(actor: TrustedIdentity, before: ServerQuote, after: ServerQuote): void {
  requirePermission(actor.permissions, "quote.edit");
  if (before.deletedAt !== after.deletedAt) {
    throw new HttpError(409, "quote_delete_not_supported", "Quote deletion is not available through this API");
  }

  requireChangedPermission(
    actor,
    "quote.revision.update",
    { defaultRevisionId: before.defaultRevisionId, revisionIds: before.revisions.map((revision) => revision.revisionId) },
    { defaultRevisionId: after.defaultRevisionId, revisionIds: after.revisions.map((revision) => revision.revisionId) },
  );
  requireChangedPermission(actor, "estimate.edit", {
    active: before.activeEstimateCost,
    history: before.estimateCostHistory,
  }, {
    active: after.activeEstimateCost,
    history: after.estimateCostHistory,
  });

  for (const nextRevision of after.revisions) {
    const previousRevision = before.revisions.find((revision) => revision.revisionId === nextRevision.revisionId);
    if (!previousRevision) {
      // Appending a client-built Revision must not turn generic PUT into the
      // dedicated type-switch workflow that is not implemented yet.
      const current = before.revisions.find(revision => revision.revisionId === before.defaultRevisionId)!;
      if (nextRevision.baseInfo.quoteType !== current.baseInfo.quoteType)
        throw new HttpError(409, "quote_type_workflow_required", "Quote type changes require a dedicated protected workflow");
      continue;
    }
    if (previousRevision.baseInfo.quoteType !== nextRevision.baseInfo.quoteType)
      throw new HttpError(409, "quote_type_workflow_required", "Quote type changes require a dedicated protected workflow");
    if (!isDeepStrictEqual(
      [previousRevision.imageAttachmentIds, previousRevision.fileAttachmentIds, previousRevision.styleImageAttachmentId],
      [nextRevision.imageAttachmentIds, nextRevision.fileAttachmentIds, nextRevision.styleImageAttachmentId],
    )) throw new HttpError(409, "quote_attachment_command_required", "Use the dedicated attachment command API");
    const previousIds = previousRevision.priceVersions.map((version) => version.id);
    const nextIds = nextRevision.priceVersions.map((version) => version.id);
    if (nextIds.some((id) => !previousIds.includes(id))) requirePermission(actor.permissions, "quote.price_version.create");
    if (previousIds.some((id) => !nextIds.includes(id))) requirePermission(actor.permissions, "quote.price_version.delete");
    for (const nextVersion of nextRevision.priceVersions) {
      const previousVersion = priceVersionById(previousRevision, nextVersion.id);
      if (!previousVersion) continue;
      requireChangedPermission(actor, "quote.settings.edit", previousVersion.pricingParameters, nextVersion.pricingParameters);
      requireChangedPermission(actor, "quote.cost.edit", {
        fabrics: previousVersion.fabrics,
        trims: previousVersion.trims,
        labor: previousVersion.labor,
        otherCosts: previousVersion.otherCosts,
      }, {
        fabrics: nextVersion.fabrics,
        trims: nextVersion.trims,
        labor: nextVersion.labor,
        otherCosts: nextVersion.otherCosts,
      });
      requireChangedPermission(actor, "quote.confirm", previousVersion.confirmation, nextVersion.confirmation);
    }
  }
}

function auditSnapshot(record: QuoteRecord | null, context: QuoteMutationContext = {}) {
  if (!record) return null;
  const revision = record.quote.revisions.find((item) => item.revisionId === (context.revisionId ?? record.quote.defaultRevisionId));
  const pv = revision?.priceVersions.find(p => p.id === context.priceVersionId);
  return {
    quoteCode: record.quote.quoteCode,
    quoteStyleNo: revision?.baseInfo.quoteStyleNo,
    styleName: revision?.baseInfo.styleName,
    revisionId: revision?.revisionId,
    revisionLabel: revision?.revisionLabel,
    ...(pv ? {priceVersionId:pv.id,priceVersionName:pv.name,laborCurrency:pv.pricingParameters.laborCurrency} : {}),
    values: {
      aggregateVersion: record.version,
      aggregateStatus: record.quote.aggregateStatus,
      revisionCount: record.quote.revisions.length,
      priceVersionCount: revision?.priceVersions.length ?? 0,
      estimateHistoryCount: record.quote.estimateCostHistory.length,
      ...(context.workflowAction === "confirmation.save" ? {confirmedLaborPrice:pv?.confirmation?.confirmedLaborPrice ?? null,
        ...(revision?.baseInfo.quoteType==='processing'?{}:{confirmedGarmentPrice:pv?.confirmation?.confirmedGarmentPrice??null}), confirmationNote:pv?.confirmation?.note ?? null,
        confirmedAt:pv?.confirmation?.confirmedAt ?? null} : {}),
    },
  };
}

export function createTrustedQuoteService(pool: Pool, dependencies: QuoteRuntimeDependencies = {}) {
  const repository = createQuoteRepository(pool);
  const now = dependencies.now ?? (() => new Date());
  const nextUuid = dependencies.randomUuid ?? randomUUID;
  const audit = (actor: TrustedIdentity, context: QuoteMutationContext): QuoteMutationHook => async (client, mutation) => {
    await appendOperationLog(client, actor, {
      module: "报价中心",
      action: mutation.kind === "create" ? "创建报价" : "保存报价",
      entityType: "Quote",
      entityId: mutation.after.quote.id,
      quoteId: mutation.after.quote.id,
      context: {
        requestId: context.requestId ?? null,
        method: context.method ?? null,
        path: context.path ?? null,
        ...(context.revisionId ? {revisionId:context.revisionId} : {}),
        ...(context.priceVersionId ? {priceVersionId:context.priceVersionId} : {}),
      },
      beforeData: auditSnapshot(mutation.before, context),
      afterData: auditSnapshot(mutation.after, context),
      metadata: {
        mutationKind: mutation.kind,
        beforeVersion: mutation.before?.version ?? null,
        afterVersion: mutation.after.version,
        ...(context.workflowAction ? { workflowAction: context.workflowAction } : {}),
      },
    });
    // A new Revision inherits relationship rows in the repository transaction.
    // Each inherited link must retain the same trusted audit boundary.
    const oldIds = new Set(mutation.before?.quote.revisions.map((revision) => revision.revisionId) ?? []);
    for (const revision of mutation.after.quote.revisions) {
      if (oldIds.has(revision.revisionId)) continue;
      for (const attachmentId of [...revision.imageAttachmentIds, ...revision.fileAttachmentIds]) {
        await appendOperationLog(client, actor, {
          module: "报价中心", action: "关联附件", entityType: "Attachment", entityId: attachmentId,
          quoteId: mutation.after.quote.id,
          context: { revisionId: revision.revisionId },
          beforeData: null,
          afterData: { attachmentId, values: { revisionId: revision.revisionId } },
        });
      }
    }
  };

  return {
    getById: repository.getById,
    /** Trusted workflow composition only; caller owns its receipt transaction. */
    async createPreparedDraftInTransaction(client: PoolClient, actor: TrustedIdentity, input: CreationInput, parameters: ServerQuote["revisions"][number]["priceVersions"][number]["pricingParameters"], names: { brand: string; salesperson: string }, context: QuoteMutationContext = {}, defaults?: {laborDescription:string;otherCost:{name:string;amount:string|null}|null}) {
      requirePermission(actor.permissions, "quote.create");
      const createdAt = now();
      const draft = createServerQuoteDraft({ quoteId: nextUuid(), revisionId: nextUuid(), priceVersionId: nextUuid(), quoteCode: await allocateQuoteCode(client, createdAt) }, actor, createdAt);
      const revision = draft.revisions[0];
      revision.baseInfo = { ...revision.baseInfo, quoteType: input.quoteType, brandId: input.fields.brandId ?? "", brandName: names.brand, salespersonId: input.fields.salespersonId ?? "", salespersonName: names.salesperson, quoteStyleNo: input.fields.styleNo, styleName: input.fields.styleName, garmentLeadDate: input.fields.garmentLeadDate, note: input.fields.note };
      revision.priceVersions[0].quantity = input.fields.quantity;
      revision.priceVersions[0].pricingParameters = parameters;
      if(defaults){
        revision.priceVersions[0].labor.description=defaults.laborDescription;
        if(defaults.otherCost)revision.priceVersions[0].otherCosts=[{id:nextUuid(),lineGroupId:nextUuid(),name:defaults.otherCost.name,specification:"",usage:"1",unit:"件",lossRate:"0",unitPrice:defaults.otherCost.amount,amount:defaults.otherCost.amount,source:"global",globalSettingId:"system-default-other-cost",overridden:false}];
      }
      return repository.createInTransaction(client, draft, audit(actor, { ...context, workflowAction: context.workflowAction ?? "quote.create.two_step" }));
    },
    async confirmationWorkflow(actor: TrustedIdentity, quoteId: string, command: QuoteConfirmationCommand, context: QuoteMutationContext = {}) {
      requirePermission(actor.permissions, "quote.view");
      requirePermission(actor.permissions, "quote.confirm");
      requireCommercialEdit(actor, "labor");
      const before = await repository.getById(quoteId);
      if (!before) throw new HttpError(404, "quote_not_found", "Quote not found");
      if (before.version !== command.expectedVersion) throw new QuoteConflictError();
      const revision = before.quote.revisions.find(item => item.revisionId === command.revisionId);
      if (revision?.baseInfo.quoteType !== "processing") requireCommercialEdit(actor, "sale");
      const next = applyQuoteConfirmation(before.quote, command, now().toISOString());
      return projectQuoteResponse(actor, await repository.save(next, command.expectedVersion, async (client, mutation) => {
        const partial = await client.query("SELECT 1 FROM sales_orders WHERE source_quote_id=$1 AND (source_revision_id IS NULL OR source_price_version_id IS NULL) LIMIT 1", [quoteId]);
        const existingTerms=await findTermsByQuoteProvenance(client,{quoteId,revisionId:command.revisionId,priceVersionId:command.priceVersionId});
          if (partial.rowCount || existingTerms) throw new HttpError(409, "quote_confirmation_linked_read_only", "Existing CCT confirmation must use shared terms; this writer is unavailable");
        await audit(actor, { ...context, workflowAction: command.action, revisionId:command.revisionId,priceVersionId:command.priceVersionId })(client, mutation);
      }));
    },
    async getForActor(actor: TrustedIdentity, id: string) {
      requirePermission(actor.permissions, "quote.view");
      const record = await repository.getById(id);
      return record ? projectQuoteResponse(actor, record) : null;
    },
    list: repository.list,
    async estimateWorkflow(actor: TrustedIdentity, quoteId: string, command: EstimateCommand, context: QuoteMutationContext = {}) {
      requirePermission(actor.permissions, "quote.edit");
      requirePermission(actor.permissions, "estimate.view");
      requirePermission(actor.permissions, "estimate.edit");
      const before = await repository.getById(quoteId);
      if (!before) throw new HttpError(404, "quote_not_found", "Quote not found");
      if (before.version !== command.expectedVersion) throw new QuoteConflictError();
      const next = applyEstimateCommand(before.quote, command, { id: nextUuid, actor: actor.userName, now: now().toISOString() });
      return projectQuoteResponse(actor, await repository.save(next, command.expectedVersion, audit(actor, { ...context, workflowAction: command.action })));
    },
    async versionWorkflow(actor: TrustedIdentity, quoteId: string, command: QuoteVersionCommand, context: QuoteMutationContext = {}) {
      requirePermission(actor.permissions, "quote.edit");
      requirePermission(actor.permissions, command.action === "revision.create" ? "quote.revision.update" : command.action === "price.create" ? "quote.price_version.create" : command.action === "price.delete" ? "quote.price_version.delete" : "quote.edit");
      const before = await repository.getById(quoteId);
      if (!before) throw new HttpError(404, "quote_not_found", "Quote not found");
      if (before.version !== command.expectedVersion) throw new QuoteConflictError();
      const next = applyQuoteVersionCommand(before.quote, command, { id: nextUuid, actor: actor.userName, now: now().toISOString() });
      authorizeReplacement(actor, before.quote, next);
      return projectQuoteResponse(actor, await repository.save(next, command.expectedVersion, audit(actor, { ...context, workflowAction: command.action,
        revisionId:command.action==="revision.create"?next.defaultRevisionId:command.revisionId,
        ...(command.action!=="revision.create"?{priceVersionId:command.action==="price.create"?next.revisions.find(r=>r.revisionId===command.revisionId)?.priceVersions.at(-1)?.id:command.priceVersionId}:{}) })));
    },
    async createRuntimeDraft(actor: TrustedIdentity, context: QuoteMutationContext = {}) {
      requirePermission(actor.permissions, "quote.create");
      const createdAt = now();
      return projectQuoteResponse(actor, await repository.createGenerated(async (client) => createServerQuoteDraft({
        quoteId: nextUuid(),
        revisionId: nextUuid(),
        priceVersionId: nextUuid(),
        quoteCode: await allocateQuoteCode(client, createdAt),
      }, actor, createdAt), audit(actor, context)));
    },
    async saveAggregate(actor: TrustedIdentity, content: QuoteSaveContent, expectedVersion: number, context: QuoteMutationContext = {}) {
      requirePermission(actor.permissions, "quote.edit");
      const inputId = content.id;
      const before = await repository.getById(inputId);
      if (!before) throw new HttpError(404, "quote_not_found", "Quote was not found");
      if (expectedVersion !== before.version) throw new QuoteConflictError();
      const containsEstimate = Object.hasOwn(content, "activeEstimateCost") || Object.hasOwn(content, "estimateCostHistory");
      if (containsEstimate && (!actor.permissions.includes("estimate.view") || !isDeepStrictEqual(
        [before.quote.activeEstimateCost, before.quote.estimateCostHistory], [content.activeEstimateCost, content.estimateCostHistory],
      ))) {
        throw new HttpError(409, "estimate_command_required", "Use the dedicated Estimate command API");
      }
      // Only now assemble a complete domain entity from the current saved slice.
      // Repository CAS still protects races occurring after this read.
      let input: ServerQuote;
      try {
        const restored = actor.permissions.includes("quote.cost.view") ? restoreRestrictedConfirmation(actor, content, before.quote) : restoreRestrictedQuoteCosts(content, before.quote);
        input = normalizeServerQuote({ ...restored, activeEstimateCost: before.quote.activeEstimateCost, estimateCostHistory: before.quote.estimateCostHistory } as ServerQuote);
        restoreProcessingHiddenFacts(input,before.quote);
        validateQuote(input);
      } catch (error) {
        if (error instanceof QuoteInvariantError || error instanceof TypeError) throw new HttpError(400, "invalid_quote", "Quote aggregate is invalid");
        throw error;
      }
      authorizeReplacement(actor, before.quote, input);
      for (const revision of input.revisions) {
        const previous = before.quote.revisions.find(r => r.revisionId === revision.revisionId);
        for (const version of revision.priceVersions) {
          const saved = previous?.priceVersions.find(p => p.id === version.id);
          if (!isDeepStrictEqual(saved?.confirmation ?? null, version.confirmation))
            throw new HttpError(409, "confirmation_command_required", "Use the dedicated confirmation command API");
        }
        const derived = summarizeRevisionConfirmations(revision as unknown as QuoteRevision);
        if (previous && isDeepStrictEqual(previous.priceVersions.map(p => p.id), revision.priceVersions.map(p => p.id))
          && !isDeepStrictEqual(revision.confirmationSummary, derived))
          throw new HttpError(409, "confirmation_command_required", "Confirmation summary is derived on Server");
        if (!revision.readOnly) revision.confirmationSummary = derived;
      }
      const current = input.revisions.find(r => r.revisionId === input.defaultRevisionId)!;
      const allowedStatus = input.defaultRevisionId !== before.quote.defaultRevisionId ? "quoting"
        : aggregateStatusAfterRevisionEdit(before.quote.aggregateStatus, current.confirmationSummary);
      if (input.aggregateStatus !== allowedStatus) throw new HttpError(409, "confirmation_command_required", "Aggregate status is derived on Server");
      if (isDeepStrictEqual(before.quote, input)) return projectQuoteResponse(actor, before);
      return projectQuoteResponse(actor, await repository.save(input, expectedVersion, audit(actor, context)));
    },
  };
}

/** The processing editor never owns omitted materials/garment/FX facts. */
function restoreProcessingHiddenFacts(input:ServerQuote,saved:ServerQuote){
 for(const r of input.revisions)if(r.baseInfo.quoteType==='processing')for(const p of r.priceVersions){
  const old=saved.revisions.find(v=>v.revisionId===r.revisionId)?.priceVersions.find(v=>v.id===p.id);if(!old)continue;
  p.fabrics=structuredClone(old.fabrics);p.trims=structuredClone(old.trims);p.otherCosts=structuredClone(old.otherCosts);p.pricingParameters={...p.pricingParameters,usdCnyRate:old.pricingParameters.usdCnyRate,markupRate:old.pricingParameters.markupRate,freightAmount:old.pricingParameters.freightAmount,includeFreight:old.pricingParameters.includeFreight,freightName:old.pricingParameters.freightName};
  if(p.confirmation&&old.confirmation){p.confirmation.quotedGarmentPrice=old.confirmation.quotedGarmentPrice;p.confirmation.confirmedGarmentPrice=old.confirmation.confirmedGarmentPrice;}
 }
}
