"""Owned synthetic PostgreSQL only: default/zstd archives must fully restore.

No ports, business volumes, credentials, source access or real DB connection.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
spec = importlib.util.spec_from_file_location('paired_backup', Path(__file__).parents[1] / 'ainuoke_paired_backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def run(args, data=None, timeout=60):
    result = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    if result.returncode:
        # This executable creates only its own synthetic fixture; it never takes
        # real credentials, data paths or database connection parameters.
        raise RuntimeError('owned_archive_runtime_command_failed: ' + result.stderr.decode(errors='replace')[-600:])
    return result.stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--postgres-image', required=True)
    args = parser.parse_args()
    image = json.loads(run(['docker', 'image', 'inspect', args.postgres_image]))[0]['Id']
    token = uuid.uuid4().hex
    name = 'zhixu-quote-trial-codec-' + token[:12] + '-database-1'
    started = False
    results = []
    with tempfile.TemporaryDirectory(prefix='weaveops-backup-codec-') as temporary:
        directory = Path(temporary).resolve()
        assert directory.parent == Path(tempfile.gettempdir()).resolve()
        assert directory.name.startswith('weaveops-backup-codec-')
        try:
            run(['docker', 'run', '-d', '--name', name, '--network', 'none', '--read-only',
                 '--label', 'io.weaveops.backup-codec-test=' + token,
                 '--tmpfs', '/var/lib/postgresql/data:rw,size=512m',
                 '--tmpfs', '/var/run/postgresql:rw,size=16m', '--tmpfs', '/tmp:rw,size=32m',
                 '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=quote_trial',
                 '-e', 'POSTGRES_DB=quote_trial', image])
            started = True
            for _ in range(100):
                ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1',
                                        '-U', 'quote_trial', '-d', 'quote_trial'],
                                       capture_output=True, timeout=5)
                if ready.returncode == 0:
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError('owned_postgres_not_ready')
            sql = b"""CREATE EXTENSION pgcrypto;
CREATE TABLE parents(id bigint PRIMARY KEY, name text);
CREATE TABLE facts(id bigserial PRIMARY KEY, parent_id bigint REFERENCES parents,
 amount numeric(40,20), payload jsonb, binary_payload bytea, optional text);
CREATE TABLE duplicates(value text);
INSERT INTO parents VALUES(1,'synthetic');
INSERT INTO facts(parent_id,amount,payload,binary_payload,optional)
 SELECT 1,9007199254740993.12345678901234567890,
 jsonb_build_object('n',g,'value',repeat(md5(g::text),128)),
 decode(md5(g::text),'hex'),CASE WHEN g%2=0 THEN NULL ELSE '' END
 FROM generate_series(1,1000) g;
INSERT INTO duplicates SELECT 'same' FROM generate_series(1,110);
SELECT setval('facts_id_seq',2000,true);
"""
            run(['docker', 'exec', '-i', name, 'psql', '-X', '-q', '-w', '-U', 'quote_trial',
                 '-d', 'quote_trial', '-v', 'ON_ERROR_STOP=1'], data=sql)

            def snapshot(database):
                raw = run(['docker', 'exec', '-i', name, 'psql', '-X', '-q', '-w', '-U', 'quote_trial',
                           '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], data=backup.SNAPSHOT_SQL.encode())
                return [json.loads(line) for line in raw.splitlines() if line.strip()]

            expected = snapshot('quote_trial')
            instance = object.__new__(backup.Backup)
            instance.db = name
            for label, policy in [('default', {}), ('zstd', {'archiveCompression': 'zstd:1'})]:
                archive = directory / (label + '.dump')
                began = time.monotonic()
                with archive.open('xb') as stream:
                    backup.execute(['docker', 'exec', name, 'pg_dump', '-w', '-U', 'quote_trial',
                                    '-d', 'quote_trial', '--format=custom', '--no-owner',
                                    *backup.archive_compression_args(policy)], output=stream, timeout=60)
                with archive.open('rb') as stream:
                    instance.verify_archive(stream)
                target = 'restore_' + label
                run(['docker', 'exec', name, 'createdb', '-U', 'quote_trial', target])
                with archive.open('rb') as stream:
                    backup.execute(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'quote_trial',
                                    '--dbname=' + target, '--exit-on-error', '--no-owner'],
                                   input_stream=stream, output=subprocess.DEVNULL, timeout=60)
                assert snapshot(target) == expected, 'full restored rows, duplicates, decimals and sequences differ'
                results.append({'compression': label, 'bytes': archive.stat().st_size,
                                'seconds': round(time.monotonic() - began, 3), 'fullRestoredSnapshotEqual': True})
                if label == 'zstd':
                    damaged = directory / 'truncated.dump'
                    damaged.write_bytes(archive.read_bytes()[:archive.stat().st_size // 2])
                    # A TOC can still be readable; data decoding must reject it.
                    with damaged.open('rb') as stream:
                        try:
                            instance.verify_archive(stream)
                        except backup.Stop as error:
                            assert str(error) == 'verify_failed'
                        else:
                            raise AssertionError('truncated data accepted')
            assert snapshot('quote_trial') == expected, 'source changed during archive validation'
            print(json.dumps({'state': 'PASS', 'image': image, 'synthetic': True,
                              'realDatabaseAccess': False, 'tables': 3, 'rows': 1111,
                              'truncatedArchiveRejected': True, 'archives': results}))
        finally:
            if started:
                actual = json.loads(run(['docker', 'inspect', name]))[0]
                assert actual['Config']['Labels']['io.weaveops.backup-codec-test'] == token
                assert actual['Image'] == image and actual['HostConfig']['NetworkMode'] == 'none'
                assert all(mount['Type'] == 'tmpfs' for mount in actual['Mounts'])
                run(['docker', 'rm', '-f', actual['Id']])


if __name__ == '__main__':
    main()
