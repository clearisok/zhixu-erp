"""Verify an isolated Issue174 original paired restore; never restore, prune or contact Source."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

from ainuoke_paired_backup import SNAPSHOT_SQL


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def fenced_snapshot_sql():
    # Same row-SHA256 multiset bytes; PG16 must sort hashes, not complete toasted records.
    old = "SELECT json_build_object('table',%L,'count',count(*),'sha256',encode(digest(coalesce(string_agg(row_sha256,'' ORDER BY row_sha256),''),'sha256'),'hex'))::text FROM (SELECT encode(digest(to_jsonb(t)::text,'sha256'),'hex') AS row_sha256 FROM %I.%I t) hashes;"
    new = "WITH hashes AS MATERIALIZED (SELECT encode(digest(to_jsonb(t)::text,'sha256'),'hex') AS row_sha256 FROM %2$I.%3$I t) SELECT json_build_object('table',%1$L,'count',count(*),'sha256',encode(digest(coalesce(string_agg(row_sha256,'' ORDER BY row_sha256),''),'sha256'),'hex'))::text FROM hashes;"
    if SNAPSHOT_SQL.count(old) != 1:
        raise RuntimeError('snapshot_algorithm_requires_review')
    return SNAPSHOT_SQL.replace(old, new)


def sql(container, database, query, timeout=7200):
    result = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-X', '-q', '-w', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], input=query.encode(), capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('isolated_verification_query_failed')
    return result.stdout.decode()


def compare_snapshot(raw, expected):
    rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    actual = {row['table']: row for row in rows}
    if len(actual) != len(rows) or set(actual) != set(expected):
        raise RuntimeError('restore_inventory_mismatch')
    mismatches = [name for name in expected if expected[name] != actual[name]]
    if mismatches:
        raise RuntimeError('restore_rows_or_sequences_mismatch:' + ','.join(mismatches))
    return actual


def verify(args):
    if not re.fullmatch(r'issue174-[a-z0-9-]+', args.container) or args.database != 'issue174_original':
        raise RuntimeError('original_isolated_target_required')
    label = subprocess.run(['docker', 'inspect', '--format', '{{ index .Config.Labels "task" }}', args.container], capture_output=True, text=True, check=True, timeout=10).stdout.strip()
    if label != 'issue174-v2':
        raise RuntimeError('rehearsal_ownership_label_missing')
    root = Path(args.backup).resolve()
    if digest(root / 'manifest.json') != args.manifest_sha256:
        raise RuntimeError('approved_manifest_mismatch')
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    if manifest['state'] != 'BACKUP_VERIFIED':
        raise RuntimeError('original_backup_not_verified')
    for name, entry in manifest['files'].items():
        path = (root / name).resolve()
        if root not in path.parents or path.is_symlink() or path.stat().st_size != entry['bytes'] or digest(path) != entry['sha256']:
            raise RuntimeError('paired_backup_file_mismatch')
    started = time.monotonic()
    raw = sql(args.container, args.database, fenced_snapshot_sql())
    expected = json.loads((root / 'database-snapshot.json').read_text(encoding='utf-8'))
    actual = compare_snapshot(raw, expected)
    objects = json.loads((root / 'object-bundle' / 'objects.json').read_text(encoding='utf-8'))['objects']
    for obj in objects:
        if not re.fullmatch(r'[0-9]+', str(obj['bytes'])):
            raise RuntimeError('invalid_object_size')
        obj['bytes'] = int(obj['bytes'])  # Node pg exports SQL BIGINT as decimal text.
    references = json.loads(sql(args.container, args.database, "SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'provider',storage_provider,'container',storage_container,'key',storage_key,'bytes',byte_size,'sha256',sha256)),'[]'::jsonb)::text FROM quote_attachments WHERE lifecycle='available';", 30))
    if {obj['id']: obj for obj in references} != {obj['id']: obj for obj in objects}:
        raise RuntimeError('paired_object_reference_mismatch')
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    report = {'state': 'ORIGINAL_RESTORE_VERIFIED', 'tableCount': len(actual) - 1, 'sequenceMetadataExact': True, 'manifestSha256': args.manifest_sha256, 'durationSeconds': round(time.monotonic() - started, 3), 'snapshotAlgorithm': 'row-sha256-multiset-v2; materialized hash projection', 'sourceWrites': 0, 'sourceRequests': 0}
    (output / 'original-snapshot.jsonl').write_text(raw, encoding='utf-8')
    (output / 'original-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (output / 'attachment-verification.json').write_text(json.dumps({'state': 'PAIRED_OBJECTS_VERIFIED', 'objects': len(objects), 'objectBytes': sum(obj['bytes'] for obj in objects), 'databaseReferencesMatched': True, 'allBackupFilesVerified': len(manifest['files']), 'manifestSha256': args.manifest_sha256, 'sourceWrites': 0, 'sourceRequests': 0}, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--backup', required=True)
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--output', required=True)
    print(json.dumps(verify(parser.parse_args())))
