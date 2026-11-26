-- Refs #174. No scheduling/cleanup activation. NOLOGIN owner is never the application role.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ainuoke_storage_maintenance') THEN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ainuoke_storage_maintenance' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls))
   OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid OR r.oid=m.member WHERE r.rolname='ainuoke_storage_maintenance') THEN
   RAISE EXCEPTION 'unsafe existing maintenance role; reconcile before migration';
  END IF;
 ELSE CREATE ROLE ainuoke_storage_maintenance NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
 END IF;
END $$;
ALTER TABLE ainuoke_sync_jobs ADD COLUMN rollup_state JSONB;
ALTER TABLE ainuoke_sync_daily_rollups ADD COLUMN seen_contracts JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ainuoke_sync_daily_rollups ADD COLUMN capture_attempts BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ainuoke_sync_audit_batches ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE ainuoke_sync_audit_batches ADD COLUMN resolution_evidence JSONB;
ALTER TABLE ainuoke_sync_capture_attempts ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE ainuoke_sync_capture_attempts ADD COLUMN resolution_evidence JSONB;
ALTER TABLE ainuoke_sync_capture_attempts ADD COLUMN rolled_up_at TIMESTAMPTZ;

CREATE FUNCTION validate_ainuoke_content_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ainuoke_source_profiles WHERE source_key=NEW.source_key AND account_fingerprint=NEW.account_fingerprint)
 OR NOT (EXISTS(SELECT 1 FROM ainuoke_catalog_entries WHERE source_key=NEW.source_key AND source_id=NEW.source_id AND sales_contract_no=NEW.sales_contract_no)
  OR EXISTS(SELECT 1 FROM sales_order_source_links WHERE source_system='ainuoke' AND source_entity_type='sales_contract' AND external_id=NEW.source_id AND sales_contract_no=NEW.sales_contract_no))
 OR NEW.body->>'schemaVersion' IS DISTINCT FROM 'ainuoke-business-content.v1'
 OR NEW.body->'scope' IS DISTINCT FROM jsonb_build_object('sourceKey',NEW.source_key,'accountFingerprint',NEW.account_fingerprint,'sourceId',NEW.source_id,'contract',NEW.sales_contract_no,'kind',NEW.kind)
 THEN RAISE EXCEPTION 'shared content trusted scope mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shared_content_scope BEFORE INSERT ON ainuoke_contract_contents FOR EACH ROW EXECUTE FUNCTION validate_ainuoke_content_scope();

-- Preserve the original guards, permitting only a narrow NOLOGIN maintenance owner.
CREATE OR REPLACE FUNCTION preserve_catalog_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='ainuoke_storage_maintenance' THEN
  IF TG_OP='DELETE' AND TG_TABLE_NAME IN ('ainuoke_contract_observations','ainuoke_catalog_runs','ainuoke_catalog_capture_evidence','ainuoke_catalog_evidence_chunks','ainuoke_catalog_scan_pages','ainuoke_contract_contents') THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME='ainuoke_contract_observations' AND TG_OP='UPDATE' AND NEW.permanent_hold AND NOT OLD.permanent_hold AND (to_jsonb(NEW)-'permanent_hold')=(to_jsonb(OLD)-'permanent_hold') THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'source catalogue evidence and receipts are immutable' USING ERRCODE='23514';
END $$;
CREATE OR REPLACE FUNCTION guard_ainuoke_audit_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='ainuoke_storage_maintenance' AND TG_OP='DELETE' AND TG_TABLE_NAME IN ('ainuoke_sync_audit_batches','ainuoke_sync_audit_tables','ainuoke_sync_audit_events','ainuoke_catalog_diagnostics') THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'sync audit records cannot be deleted' USING ERRCODE='23514';
END $$;
CREATE OR REPLACE FUNCTION reject_operation_log_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='ainuoke_storage_maintenance' AND TG_OP='DELETE' AND OLD.entity_type='AinuokeCatalogRun'
  AND OLD.metadata->>'automatic'='true' AND OLD.metadata->>'sourceOnly'='true' AND OLD.created_at<clock_timestamp()-interval '7 days' THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'operation_logs is append-only' USING ERRCODE='55000';
END $$;
CREATE OR REPLACE FUNCTION guard_ainuoke_capture_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='ainuoke_storage_maintenance' AND TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND current_user='ainuoke_storage_maintenance' AND (to_jsonb(NEW)-ARRAY['resolved_at','resolution_evidence','rolled_up_at'])=(to_jsonb(OLD)-ARRAY['resolved_at','resolution_evidence','rolled_up_at']) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.resolved_at,NEW.resolution_evidence,NEW.rolled_up_at) IS DISTINCT FROM (OLD.resolved_at,OLD.resolution_evidence,OLD.rolled_up_at) THEN RAISE EXCEPTION 'resolution requires trusted review' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' OR OLD.status<>'running' OR
  (NEW.id,NEW.source_key,NEW.account_fingerprint,NEW.actor_id,NEW.mode,NEW.job_ids,NEW.started_at) IS DISTINCT FROM
  (OLD.id,OLD.source_key,OLD.account_fingerprint,OLD.actor_id,OLD.mode,OLD.job_ids,OLD.started_at) THEN
  RAISE EXCEPTION 'capture attempt is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION protect_ainuoke_resolution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.resolved_at,NEW.resolution_evidence) IS DISTINCT FROM (OLD.resolved_at,OLD.resolution_evidence) AND current_user<>'ainuoke_storage_maintenance' THEN RAISE EXCEPTION 'resolution requires trusted review' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_batch_resolution_guard BEFORE UPDATE ON ainuoke_sync_audit_batches FOR EACH ROW EXECUTE FUNCTION protect_ainuoke_resolution();
CREATE OR REPLACE FUNCTION guard_ainuoke_sync_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='ainuoke_storage_maintenance' THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF (to_jsonb(NEW)-ARRAY['rolled_up_at','rollup_state','resolved_at','resolution_evidence'])=(to_jsonb(OLD)-ARRAY['rolled_up_at','rollup_state','resolved_at','resolution_evidence']) THEN RETURN NEW; END IF;
 END IF;
 IF TG_OP='DELETE' OR OLD.status IN ('complete','failed') THEN RAISE EXCEPTION 'source job receipts are immutable' USING ERRCODE='23514'; END IF;
 IF (NEW.rolled_up_at,NEW.rollup_state,NEW.resolved_at,NEW.resolution_evidence) IS DISTINCT FROM (OLD.rolled_up_at,OLD.rollup_state,OLD.resolved_at,OLD.resolution_evidence) THEN RAISE EXCEPTION 'maintenance fields are protected' USING ERRCODE='23514'; END IF;
 IF (NEW.id,NEW.source_key,NEW.source_id,NEW.sales_contract_no,NEW.requested_at,NEW.retry_of,NEW.root_job_id,NEW.attempt_number) IS DISTINCT FROM
    (OLD.id,OLD.source_key,OLD.source_id,OLD.sales_contract_no,OLD.requested_at,OLD.retry_of,OLD.root_job_id,OLD.attempt_number) THEN RAISE EXCEPTION 'source job identity is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='queued' AND NEW.status IN ('running','failed')) OR (OLD.status='running' AND NEW.status IN ('complete','failed','unknown')) OR (OLD.status='unknown' AND NEW.status='failed')) THEN RAISE EXCEPTION 'invalid source job transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

-- Durable fixed-reference protection; deliberately conservative for attribution proofs.
CREATE FUNCTION hold_ainuoke_attribution_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('ainuoke-storage-maintenance',0));
 UPDATE public.ainuoke_contract_observations SET permanent_hold=true WHERE NOT permanent_hold;
 RETURN NEW;
END $$;
CREATE TRIGGER attribution_source_evidence_hold AFTER INSERT ON sales_order_attribution_changes FOR EACH ROW EXECUTE FUNCTION hold_ainuoke_attribution_evidence();
CREATE TRIGGER normalization_source_evidence_hold AFTER INSERT ON sales_order_normalization_proofs FOR EACH ROW EXECUTE FUNCTION hold_ainuoke_attribution_evidence();

CREATE FUNCTION ainuoke_storage_rollup(p_source TEXT,p_limit INTEGER DEFAULT 100) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE job RECORD; state JSONB; prior JSONB; bucket TEXT; day_key DATE; processed INTEGER=0; epoch TIMESTAMPTZ;
BEGIN
 IF p_limit<1 OR p_limit>500 THEN RAISE EXCEPTION 'invalid maintenance batch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ainuoke-storage-maintenance',0));
 SELECT (to_jsonb(p)->>'source_history_started_at')::timestamptz INTO epoch FROM public.ainuoke_source_profiles p WHERE source_key=p_source;
 FOR job IN SELECT * FROM public.ainuoke_sync_jobs WHERE source_key=p_source AND status IN ('complete','failed','unknown')
  AND requested_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'-interval '89 days'
  AND requested_at>=coalesce(epoch,'-infinity'::timestamptz)
  AND (rollup_state IS NULL OR rollup_state->>'status' IS DISTINCT FROM status)
  ORDER BY requested_at,id LIMIT p_limit FOR UPDATE LOOP
  day_key=(job.requested_at AT TIME ZONE 'Asia/Shanghai')::date;
  bucket=CASE WHEN job.finished_at IS NULL OR job.started_at IS NULL THEN 'unavailable' WHEN job.finished_at-job.started_at<interval '1 second' THEN 'lt1s' WHEN job.finished_at-job.started_at<interval '5 seconds' THEN '1to5s' WHEN job.finished_at-job.started_at<interval '15 seconds' THEN '5to15s' WHEN job.finished_at-job.started_at<interval '60 seconds' THEN '15to60s' ELSE 'gte60s' END;
  state=jsonb_build_object('status',job.status,'unchanged',job.result->>'businessChanged'='false','bucket',bucket); prior=job.rollup_state;
  INSERT INTO public.ainuoke_sync_daily_rollups(source_key,day) VALUES(p_source,day_key) ON CONFLICT DO NOTHING;
  UPDATE public.ainuoke_sync_daily_rollups SET
   attempts=attempts+CASE WHEN prior IS NULL THEN 1 ELSE 0 END,
   successes=successes+(job.status='complete')::int-coalesce((prior->>'status'='complete')::int,0),
   failures=failures+(job.status='failed')::int-coalesce((prior->>'status'='failed')::int,0),
   unknown_results=unknown_results+(job.status='unknown')::int-coalesce((prior->>'status'='unknown')::int,0),
   unchanged=unchanged+coalesce((state->>'unchanged')::boolean::int,0)-coalesce((prior->>'unchanged')::boolean::int,0),
   distinct_contracts=distinct_contracts+CASE WHEN seen_contracts ? job.source_id THEN 0 ELSE 1 END,
   seen_contracts=seen_contracts||jsonb_build_object(job.source_id,true),
   duration_buckets=jsonb_set(CASE WHEN prior IS NULL THEN duration_buckets ELSE jsonb_set(duration_buckets,ARRAY[prior->>'bucket'],to_jsonb(coalesce((duration_buckets->>(prior->>'bucket'))::bigint,0)-1)) END,
    ARRAY[bucket],to_jsonb(coalesce((duration_buckets->>bucket)::bigint,0)+1-CASE WHEN prior->>'bucket'=bucket THEN 1 ELSE 0 END)),
   updated_at=clock_timestamp() WHERE source_key=p_source AND day=day_key;
  UPDATE public.ainuoke_sync_jobs SET rolled_up_at=clock_timestamp(),rollup_state=state WHERE id=job.id;
  processed=processed+1;
 END LOOP;
 FOR job IN SELECT * FROM public.ainuoke_sync_capture_attempts WHERE source_key=p_source AND rolled_up_at IS NULL
  AND started_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai'-interval '89 days'
  AND started_at>=coalesce(epoch,'-infinity'::timestamptz)
  ORDER BY started_at,id LIMIT p_limit FOR UPDATE LOOP
  day_key=(job.started_at AT TIME ZONE 'Asia/Shanghai')::date;
  INSERT INTO public.ainuoke_sync_daily_rollups(source_key,day,capture_attempts) VALUES(p_source,day_key,1)
   ON CONFLICT(source_key,day) DO UPDATE SET capture_attempts=public.ainuoke_sync_daily_rollups.capture_attempts+1,updated_at=clock_timestamp();
  UPDATE public.ainuoke_sync_capture_attempts SET rolled_up_at=clock_timestamp() WHERE id=job.id;
 END LOOP;
 INSERT INTO public.ainuoke_sync_daily_rollups(source_key,day,database_bytes,measured_at) VALUES(p_source,(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date,pg_database_size(current_database()),clock_timestamp())
 ON CONFLICT(source_key,day) DO UPDATE SET database_bytes=excluded.database_bytes,measured_at=excluded.measured_at
 WHERE public.ainuoke_sync_daily_rollups.measured_at IS NULL OR public.ainuoke_sync_daily_rollups.measured_at<clock_timestamp()-interval '1 hour';
 RETURN jsonb_build_object('processed',processed,'countBasis','durable_job_attempt','quantiles','fixed_bucket_estimates');
END $$;

CREATE FUNCTION ainuoke_storage_prune(p_source TEXT,p_apply BOOLEAN DEFAULT false,p_limit INTEGER DEFAULT 100) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE candidate RECORD; counts JSONB='{}'; ids UUID[]; n INTEGER; enabled BOOLEAN;
BEGIN
 IF p_limit<1 OR p_limit>500 THEN RAISE EXCEPTION 'invalid maintenance batch'; END IF;
 -- Same source fence as publication. Foreign keys remain active as the last recheck.
 PERFORM pg_advisory_xact_lock(hashtextextended('ainuoke-source:'||p_source,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('ainuoke-storage-maintenance',0));
 SELECT storage_cleanup_enabled INTO enabled FROM public.ainuoke_sync_controls WHERE source_key=p_source FOR SHARE;
 IF p_apply AND enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'cleanup is disabled'; END IF;
 FOR candidate IN SELECT o.id FROM public.ainuoke_contract_observations o JOIN public.ainuoke_sync_jobs j ON j.id=o.job_id
  WHERE o.source_key=p_source AND o.record_kind='confirmation' AND NOT o.permanent_hold AND o.captured_at<clock_timestamp()-interval '7 days'
   AND j.status='complete' AND j.retry_of IS NULL AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_jobs child WHERE child.retry_of=j.id OR child.root_job_id=j.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_contract_sync_state s WHERE s.observation_id=o.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_material_order_heads h WHERE h.verified_observation_id=o.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_source_runs r WHERE r.origin_observation_id=o.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_catalog_intake_receipts r WHERE r.observation_id=o.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_audit_tables t WHERE t.publication_ids @> ARRAY[o.id::text])
  ORDER BY o.captured_at,o.id LIMIT p_limit FOR UPDATE OF o LOOP
  counts=jsonb_set(counts,'{confirmations}',to_jsonb(coalesce((counts->>'confirmations')::int,0)+1));
  IF p_apply THEN DELETE FROM public.ainuoke_contract_observations WHERE id=candidate.id; END IF;
 END LOOP;
 -- Non-source process details only. Failed/partial/unknown are held without trusted resolution.
 SELECT array_agg(b.id) INTO ids FROM (SELECT b.id FROM public.ainuoke_sync_audit_batches b WHERE b.source_key=p_source
  AND ((b.status IN ('success','replayed') AND b.finished_at<clock_timestamp()-interval '7 days') OR (b.status='failed' AND b.resolved_at<clock_timestamp()-interval '30 days' AND b.resolution_evidence IS NOT NULL))
  AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_audit_record_state s WHERE s.batch_id=b.id)
  AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_jobs j WHERE j.id=ANY(b.job_ids) AND (j.status IN ('queued','running','unknown') OR j.status='failed' AND j.resolved_at IS NULL))
  ORDER BY b.finished_at,b.id LIMIT p_limit FOR UPDATE) b;
 counts=counts||jsonb_build_object('auditBatches',coalesce(cardinality(ids),0));
 IF p_apply AND ids IS NOT NULL THEN
  DELETE FROM public.ainuoke_catalog_diagnostics WHERE batch_id=ANY(ids);
  DELETE FROM public.ainuoke_sync_audit_events WHERE batch_id=ANY(ids);
  DELETE FROM public.ainuoke_sync_audit_tables WHERE batch_id=ANY(ids);
  DELETE FROM public.ainuoke_sync_audit_batches WHERE id=ANY(ids);
 END IF;
 SELECT array_agg(r.id) INTO ids FROM (SELECT r.id FROM public.ainuoke_catalog_runs r JOIN public.ainuoke_sync_jobs j ON j.id=r.request_id
  WHERE r.source_key=p_source AND j.status='complete' AND r.created_at<clock_timestamp()-interval '7 days'
  AND NOT EXISTS(SELECT 1 FROM public.ainuoke_catalog_entries e WHERE e.observed_run_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM public.ainuoke_source_profiles p WHERE p.catalog_run_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM public.ainuoke_contract_lifecycle_events e WHERE e.previous_seen_run_id=r.id OR e.confirmed_run_id=r.id)
  AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_audit_tables t WHERE t.publication_ids @> ARRAY[r.id::text])
  ORDER BY r.created_at,r.id LIMIT p_limit FOR UPDATE OF r) r;
 counts=counts||jsonb_build_object('contractDirectories',coalesce(cardinality(ids),0));
 IF p_apply AND ids IS NOT NULL THEN DELETE FROM public.ainuoke_catalog_runs WHERE id=ANY(ids); END IF;
 SELECT array_agg(p.request_id) INTO ids FROM (SELECT DISTINCT p.request_id FROM public.ainuoke_catalog_scan_pages p JOIN public.ainuoke_catalog_requests r USING(source_key,request_id)
  WHERE p.source_key=p_source AND p.captured_at<clock_timestamp()-interval '7 days' AND r.status='complete'
  AND NOT EXISTS(SELECT 1 FROM public.ainuoke_catalog_scan_state s WHERE s.source_key=p_source AND s.status IN ('running','unknown') AND (s.last_request_id=p.request_id OR s.last_success_request_id=p.request_id)) LIMIT p_limit) p;
 IF p_apply AND ids IS NOT NULL THEN DELETE FROM public.ainuoke_catalog_scan_pages WHERE source_key=p_source AND request_id=ANY(ids); END IF;
 counts=counts||jsonb_build_object('checkpointRequests',coalesce(cardinality(ids),0));
 IF p_apply THEN
  DELETE FROM public.ainuoke_catalog_capture_evidence c WHERE c.id IN (SELECT q.id FROM public.ainuoke_catalog_capture_evidence q WHERE q.source_key=p_source AND q.created_at<clock_timestamp()-interval '7 days'
   AND q.directory->>'schemaVersion' IN ('ainuoke-packed-directory.v1','ainuoke-packed-after-only.v1')
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_source_runs r WHERE r.directory_capture_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_contract_observations o WHERE o.capture_evidence_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_catalog_runs r WHERE r.capture_evidence_id=q.id OR to_jsonb(r)->>'legacy_directory_capture_id'=q.id::text)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_material_order_heads h WHERE h.verified_capture_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.operation_logs l WHERE l.source_directory_capture_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_audit_batches b WHERE b.source_key=q.source_key AND b.directory_evidence_ids @> ARRAY[q.id]) LIMIT p_limit);
  GET DIAGNOSTICS n=ROW_COUNT; counts=counts||jsonb_build_object('unreferencedCaptures',n);
  DELETE FROM public.ainuoke_catalog_evidence_chunks c WHERE (c.source_key,c.content_hash) IN (SELECT q.source_key,q.content_hash FROM public.ainuoke_catalog_evidence_chunks q WHERE q.source_key=p_source AND q.created_at<clock_timestamp()-interval '7 days'
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_catalog_capture_evidence c WHERE c.source_key=p_source AND coalesce(c.directory->>'schemaVersion','') NOT IN ('ainuoke-packed-directory.v1','ainuoke-packed-after-only.v1'))
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_catalog_capture_evidence c WHERE c.source_key=q.source_key AND jsonb_path_exists(c.directory,'$.**.rowsHash ? (@ == $h)',jsonb_build_object('h',q.content_hash)))
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_catalog_scan_pages p WHERE p.source_key=q.source_key AND p.rows_hash=q.content_hash) LIMIT p_limit);
  GET DIAGNOSTICS n=ROW_COUNT; counts=counts||jsonb_build_object('unreferencedChunks',n);
  DELETE FROM public.ainuoke_contract_contents c WHERE c.id IN (SELECT q.id FROM public.ainuoke_contract_contents q WHERE q.source_key=p_source AND q.created_at<clock_timestamp()-interval '7 days'
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_material_source_snapshots s WHERE s.material_content_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_contract_observations o WHERE o.material_content_id=q.id OR o.color_content_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.operation_logs l WHERE l.source_color_content_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_material_order_heads h WHERE h.verified_material_manifest->>'contentId'=q.id::text) LIMIT p_limit);
  GET DIAGNOSTICS n=ROW_COUNT; counts=counts||jsonb_build_object('unreferencedContents',n);
  DELETE FROM public.operation_logs l WHERE l.id IN (SELECT q.id FROM public.operation_logs q WHERE q.entity_type='AinuokeCatalogRun' AND q.metadata->>'sourceOnly'='true' AND q.metadata->>'automatic'='true'
   AND q.metadata->>'sourceKey'=p_source AND q.created_at<clock_timestamp()-interval '7 days' LIMIT p_limit);
  GET DIAGNOSTICS n=ROW_COUNT; counts=counts||jsonb_build_object('automaticSuccessLogs',n);
  DELETE FROM public.ainuoke_sync_jobs j WHERE j.id IN (SELECT q.id FROM public.ainuoke_sync_jobs q WHERE q.source_key=p_source AND q.kind='automatic'
   AND ((q.status='complete' AND q.finished_at<clock_timestamp()-interval '7 days') OR (q.status='failed' AND q.resolved_at<clock_timestamp()-interval '30 days' AND q.resolution_evidence IS NOT NULL)) AND q.rolled_up_at IS NOT NULL
   AND q.retry_of IS NULL AND q.root_job_id IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_contract_observations o WHERE o.job_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_requests r WHERE r.job_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_jobs child WHERE child.retry_of=q.id OR child.root_job_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_catalog_runs r WHERE r.request_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_audit_batches b WHERE q.id=ANY(b.job_ids))
   LIMIT p_limit);
  GET DIAGNOSTICS n=ROW_COUNT; counts=counts||jsonb_build_object('automaticJobs',n);
  DELETE FROM public.ainuoke_sync_capture_attempts a WHERE a.id IN (SELECT q.id FROM public.ainuoke_sync_capture_attempts q WHERE q.source_key=p_source
   AND ((q.status='complete' AND q.finished_at<clock_timestamp()-interval '7 days') OR (q.status='failed' AND q.resolved_at<clock_timestamp()-interval '30 days' AND q.resolution_evidence IS NOT NULL))
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_jobs j WHERE j.capture_attempt_id=q.id)
   AND NOT EXISTS(SELECT 1 FROM public.ainuoke_sync_audit_batches b WHERE q.id=ANY(b.capture_ids)) LIMIT p_limit);
  GET DIAGNOSTICS n=ROW_COUNT; counts=counts||jsonb_build_object('captureDetails',n);
  DELETE FROM public.ainuoke_sync_daily_rollups WHERE source_key=p_source AND day<(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date-89;
 END IF;
 RETURN jsonb_build_object('apply',p_apply,'cleanupEnabled',coalesce(enabled,false),'candidates',counts,'holds','business/current/change/unresolved/unknown/idempotency/retry');
END $$;

-- Existing records carry the failure lifecycle. No incident table and no inference from later success.
CREATE FUNCTION ainuoke_storage_resolve_failure(p_source TEXT,p_kind TEXT,p_id UUID,p_apply BOOLEAN DEFAULT false,p_expected TEXT DEFAULT NULL,p_proof JSONB DEFAULT NULL) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE relation TEXT; record JSONB; fingerprint TEXT;
BEGIN
 relation=CASE p_kind WHEN 'job' THEN 'ainuoke_sync_jobs' WHEN 'capture' THEN 'ainuoke_sync_capture_attempts' WHEN 'audit' THEN 'ainuoke_sync_audit_batches' ELSE NULL END;
 IF relation IS NULL THEN RAISE EXCEPTION 'unsupported failure record'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE source_key=$1 AND id=$2 FOR UPDATE',relation) INTO record USING p_source,p_id;
 IF record IS NULL OR record->>'status'<>'failed' OR record->>'resolved_at' IS NOT NULL THEN RAISE EXCEPTION 'failure is missing, unresolved unknown, or already resolved'; END IF;
 fingerprint=encode(public.digest((record-ARRAY['resolved_at','resolution_evidence','rolled_up_at','rollup_state'])::text,'sha256'),'hex');
 IF NOT p_apply THEN RETURN jsonb_build_object('kind',p_kind,'id',p_id,'status','failed','previewHash',fingerprint,'sourceRequests',0); END IF;
 IF p_expected IS DISTINCT FROM fingerprint OR jsonb_typeof(p_proof) IS DISTINCT FROM 'object' OR p_proof-ARRAY['reason','reviewReference']<>'{}'::jsonb
  OR jsonb_typeof(p_proof->'reason') IS DISTINCT FROM 'string' OR length(p_proof->>'reason') NOT BETWEEN 3 AND 2000
  OR jsonb_typeof(p_proof->'reviewReference') IS DISTINCT FROM 'string' OR length(p_proof->>'reviewReference') NOT BETWEEN 1 AND 400 THEN RAISE EXCEPTION 'trusted failure review changed or proof invalid'; END IF;
 EXECUTE format('UPDATE public.%I SET resolved_at=clock_timestamp(),resolution_evidence=$3 WHERE source_key=$1 AND id=$2',relation)
 USING p_source,p_id,p_proof||jsonb_build_object('reviewedFingerprint',fingerprint,'resolvedBySession',session_user);
 RETURN jsonb_build_object('kind',p_kind,'id',p_id,'resolved',true,'retentionDaysFromResolution',30,'sourceRequests',0);
END $$;

REVOKE ALL ON FUNCTION hold_ainuoke_attribution_evidence(),ainuoke_storage_rollup(TEXT,INTEGER),ainuoke_storage_prune(TEXT,BOOLEAN,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION ainuoke_storage_resolve_failure(TEXT,TEXT,UUID,BOOLEAN,TEXT,JSONB) FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO ainuoke_storage_maintenance;
GRANT SELECT ON ainuoke_source_profiles,ainuoke_sync_controls,ainuoke_catalog_entries,ainuoke_contract_sync_state,ainuoke_material_order_heads,ainuoke_source_runs,ainuoke_catalog_intake_receipts,ainuoke_sync_requests,ainuoke_contract_lifecycle_events,ainuoke_catalog_scan_state,ainuoke_sync_audit_record_state TO ainuoke_storage_maintenance;
GRANT SELECT,DELETE ON ainuoke_contract_observations,ainuoke_catalog_runs,ainuoke_catalog_capture_evidence,ainuoke_catalog_evidence_chunks,ainuoke_contract_contents,ainuoke_catalog_scan_pages,ainuoke_sync_audit_batches,ainuoke_sync_audit_tables,ainuoke_sync_audit_events,ainuoke_catalog_diagnostics,ainuoke_sync_capture_attempts,ainuoke_sync_jobs TO ainuoke_storage_maintenance;
GRANT SELECT,DELETE ON operation_logs TO ainuoke_storage_maintenance;
GRANT UPDATE(resolved_at,resolution_evidence) ON ainuoke_sync_audit_batches TO ainuoke_storage_maintenance;
GRANT UPDATE(resolved_at,resolution_evidence) ON ainuoke_sync_capture_attempts TO ainuoke_storage_maintenance;
GRANT UPDATE(rolled_up_at) ON ainuoke_sync_capture_attempts TO ainuoke_storage_maintenance;
GRANT UPDATE(id) ON ainuoke_catalog_runs TO ainuoke_storage_maintenance;
GRANT UPDATE(storage_cleanup_enabled) ON ainuoke_sync_controls TO ainuoke_storage_maintenance;
GRANT SELECT ON ainuoke_material_source_snapshots TO ainuoke_storage_maintenance;
GRANT SELECT ON ainuoke_catalog_requests TO ainuoke_storage_maintenance;
GRANT UPDATE(permanent_hold) ON ainuoke_contract_observations TO ainuoke_storage_maintenance;
GRANT UPDATE(rolled_up_at,rollup_state,resolved_at,resolution_evidence) ON ainuoke_sync_jobs TO ainuoke_storage_maintenance;
GRANT SELECT,INSERT,UPDATE,DELETE ON ainuoke_sync_daily_rollups TO ainuoke_storage_maintenance;
ALTER FUNCTION hold_ainuoke_attribution_evidence() OWNER TO ainuoke_storage_maintenance;
ALTER FUNCTION ainuoke_storage_rollup(TEXT,INTEGER) OWNER TO ainuoke_storage_maintenance;
ALTER FUNCTION ainuoke_storage_prune(TEXT,BOOLEAN,INTEGER) OWNER TO ainuoke_storage_maintenance;
ALTER FUNCTION ainuoke_storage_resolve_failure(TEXT,TEXT,UUID,BOOLEAN,TEXT,JSONB) OWNER TO ainuoke_storage_maintenance;
REVOKE CREATE ON SCHEMA public FROM ainuoke_storage_maintenance;
