-- Capture row fingerprints are not business facts. Store the usual identity map once;
-- a capture manifest keeps only exceptional identities when a fingerprint version differs.
ALTER TABLE ainuoke_contract_contents ADD COLUMN identity_map JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(identity_map)='array');
