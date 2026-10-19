/** Internal evidence assessment. Never an execution authorization or an HTTP input DTO. */
export type Coverage = 'verified' | 'unavailable';
export type ReferenceEvidence = { coverage: Coverage; count: number | null };
export type NormalizationOrderEvidence = {
  id: string;
  trustedContract: boolean;
  processingBatchId: string | null;
  lifecycle: 'draft' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  // Source observations and customer delivery plans are NOT production execution.
  sourceSnapshots: number;
  deliveryPlans: number;
  commercialVersions: number;
  execution: ReferenceEvidence;
  financialLocks: ReferenceEvidence;
  unknownReferences: string[];
};
export type NormalizationAssessment = {
  disposition: 'coverage_incomplete' | 'financial_review' | 'dual_execution_review' | 'business_identity_review' | 'candidate_for_human_review';
  candidateOrderId: string | null;
  reasons: string[];
  executionAuthorized: false;
};
function validateEvidence(value: ReferenceEvidence) {
  if (value.coverage === 'unavailable') {
    if (value.count !== null) throw new Error('Unavailable evidence must not claim a count');
  } else if (value.coverage !== 'verified' || !Number.isSafeInteger(value.count) || value.count === null || value.count < 0) {
    throw new Error('Invalid reference evidence');
  }
}
export function assessNormalizationPair(a: NormalizationOrderEvidence, b: NormalizationOrderEvidence): NormalizationAssessment {
  if (!a.id || !b.id || a.id.toLowerCase() === b.id.toLowerCase()) throw new Error('Two distinct orders required');
  for (const order of [a,b]) {
    validateEvidence(order.execution); validateEvidence(order.financialLocks);
    for (const count of [order.sourceSnapshots, order.deliveryPlans, order.commercialVersions]) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid observation count');
    }
  }
  const result = (disposition: NormalizationAssessment['disposition'], reasons: string[], candidateOrderId: string | null = null): NormalizationAssessment => ({disposition, reasons, candidateOrderId, executionAuthorized: false});
  const reasons: string[] = [];
  for (const order of [a,b]) {
    if (order.execution.coverage !== 'verified') reasons.push(`${order.id}:execution_not_covered`);
    if (order.financialLocks.coverage !== 'verified') reasons.push(`${order.id}:financial_locks_not_covered`);
    if (order.unknownReferences.length) reasons.push(`${order.id}:unclassified_references`);
  }
  if (reasons.length) return result('coverage_incomplete', reasons);
  if ([a,b].some(order => order.financialLocks.count! > 0 || order.lifecycle === 'completed')) {
    return result('financial_review', ['frozen_or_completed_history_must_be_preserved']);
  }
  // Separate processing batches represent potentially legitimate repeated orders.
  if (a.processingBatchId !== null || b.processingBatchId !== null) {
    return result('business_identity_review', ['processing_batch_is_not_a_duplicate_quote_identity']);
  }
  const withExecution = [a,b].filter(order => order.execution.count! > 0);
  if (withExecution.length === 2) return result('dual_execution_review', ['both_orders_have_execution_do_not_sum_or_move']);
  if ([a,b].some(order => order.lifecycle === 'cancelled')) return result('business_identity_review', ['cancelled_order_requires_explicit_business_review']);
  if (withExecution.length === 1) return result('candidate_for_human_review', ['preserve_executed_order_subject_to_identity_confirmation'], withExecution[0].id);
  const trusted = [a,b].filter(order => order.trustedContract);
  if (trusted.length !== 1) return result('business_identity_review', ['no_unique_trusted_contract_candidate']);
  return result('candidate_for_human_review', ['no_verified_execution_prefer_trusted_contract_subject_to_confirmation'], trusted[0].id);
}
