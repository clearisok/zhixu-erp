import {hash,SourceError} from './contract.js';
import {validateContractEvidence} from './payment-request-contract-probe.js';
import {parsePaymentCollectionRequest,type PaymentCollectionRequest} from './payment-request-collection.js';

export type PaymentTargetVerification={proofSha256:string;selectionHash:string;sourceFingerprint:string;verifiedAt:string;
 contracts:ReadonlyArray<{alias:string;rowCount:number;pageCount:number;contentHash:string}>};
const verified = new WeakSet<PaymentTargetVerification>();
export function assertPaymentTargetVerification(value: PaymentTargetVerification | null): asserts value is PaymentTargetVerification {
 if (!value || !verified.has(value)) throw new SourceError('payment_operator_verification_required');
}
const fail=():never=>{throw new SourceError('payment_operator_verification_invalid');};
/** Rebuild historical filter evidence, never treat it as a fresh publication.
 * The file hash binds an operator-reviewed artifact; it is not human approval
 * or a cryptographic attestation by the upstream ERP. No IO or credentials. */
export function verifyPaymentTargetEvidence(input:unknown,proofSha256:string,requestInput:PaymentCollectionRequest,now=Date.now()):PaymentTargetVerification{
 if(!/^[a-f0-9]{64}$/u.test(proofSha256)||!input||typeof input!=='object'||Array.isArray(input)||!Number.isFinite(now))return fail();
 const request=parsePaymentCollectionRequest(requestInput),row=input as Record<string,unknown>;
 if(Object.keys(row).sort().join(',')!=='contracts,databaseAccess,evidence,schemaVersion,selection,selectionHash,sourceActivation,sourceFingerprint,toolingCommit,validationStatus'
  ||row.schemaVersion!=='ainuoke-payment-contract-private.v1'||row.validationStatus!=='accepted'||row.databaseAccess!=='none'
  ||row.sourceActivation!=='not-activated'||row.sourceFingerprint!==request.selection.sourceFingerprint
  ||row.selectionHash!==hash(request.selection)||hash(row.selection)!==hash(request.selection)
  ||typeof row.toolingCommit!=='string'||!/^[a-f0-9]{40}$/u.test(row.toolingCommit))return fail();
 const evidence=row.evidence as {pages?:unknown[]};
 if(!evidence||!Array.isArray(evidence.pages)||!evidence.pages.length)return fail();
 const times=evidence.pages.map(page=>page&&typeof page==='object'?Date.parse(String((page as Record<string,unknown>).capturedAt)):NaN);
 const observedThrough=Math.max(...times);
 if(!Number.isFinite(observedThrough)||observedThrough>now)return fail();
 const checked=validateContractEvidence(row.evidence,request.config,request.selection,observedThrough);
 if(checked.summary.result!=='READ_ONLY_CONTRACT_PROBE_RECORDED'||!('contractSummaries' in checked.summary)||!('contracts' in checked.privateReport)
  ||hash(row.contracts)!==hash(checked.privateReport.contracts))return fail();
 const result = Object.freeze({proofSha256,selectionHash:hash(request.selection),sourceFingerprint:request.selection.sourceFingerprint,
  verifiedAt:new Date(observedThrough).toISOString(),contracts:Object.freeze(checked.summary.contractSummaries!.map(row => Object.freeze({...row})))});
 verified.add(result); return result;
}
