-- Gate4 additive evidence/review schema. No historical migration or execute activation.
CREATE TABLE sales_order_normalization_target (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
 target_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE
);
INSERT INTO sales_order_normalization_target(singleton) VALUES(true);
CREATE TRIGGER normalization_target_immutable BEFORE UPDATE OR DELETE ON sales_order_normalization_target FOR EACH ROW EXECUTE FUNCTION protect_order_normalization_history();
CREATE TABLE sales_order_normalization_proofs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id UUID NOT NULL REFERENCES sales_order_normalization_cases(id) ON DELETE RESTRICT,
 case_version INTEGER NOT NULL CHECK(case_version>0),
 target_fingerprint TEXT NOT NULL CHECK(target_fingerprint ~ '^[0-9a-f]{64}$'),
 evidence_hash TEXT NOT NULL CHECK(evidence_hash ~ '^[0-9a-f]{64}$'),
 proposal_hash TEXT NOT NULL CHECK(proposal_hash ~ '^[0-9a-f]{64}$'),
 proposal JSONB NOT NULL CHECK(jsonb_typeof(proposal)='object'),
 evidence_summary JSONB NOT NULL CHECK(jsonb_typeof(evidence_summary)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(case_id,case_version,target_fingerprint,evidence_hash,proposal_hash)
);
CREATE TABLE sales_order_normalization_reviews (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
 proof_id UUID NOT NULL REFERENCES sales_order_normalization_proofs(id) ON DELETE RESTRICT,
 actor_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
 review_type TEXT NOT NULL CHECK(review_type IN ('production','finance')),
 decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),
 reason TEXT NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_id)
);
CREATE TRIGGER normalization_proof_immutable BEFORE UPDATE OR DELETE ON sales_order_normalization_proofs FOR EACH ROW EXECUTE FUNCTION protect_order_normalization_history();
CREATE TRIGGER normalization_review_immutable BEFORE UPDATE OR DELETE ON sales_order_normalization_reviews FOR EACH ROW EXECUTE FUNCTION protect_order_normalization_history();
ALTER TABLE sales_order_attribution_changes ADD COLUMN review_proof_id UUID REFERENCES sales_order_normalization_proofs(id) ON DELETE RESTRICT;
