-- Necessary attribution/visibility context events are not a claim of changed raw facts.
ALTER TABLE ainuoke_source_runs ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'legacy'
 CHECK(record_kind IN ('legacy','initial','change','context'));
