"""Host-only, explicitly activated Docker supervisor. Never reads upstream itself.

Private config points to an immutable worker image and existing private files.
Fault exits are sticky; only the planned backup pause resumes automatically.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import uuid

BEIJING = timezone(timedelta(hours=8))
DOCKER = '/usr/bin/docker'

def quiet_window(now):
    local = now.astimezone(BEIJING)
    minute = local.hour * 60 + local.minute
    # Stop early enough for the current bounded capture and publication.
    return 3 * 60 + 12 <= minute < 3 * 60 + 50

def backup_verified(receipt, source, project, quiet_date, now):
    try:
        finished = datetime.fromisoformat(receipt['finishedAt'].replace('Z', '+00:00'))
        boundary = datetime.fromisoformat(quiet_date + 'T03:12:00+08:00')
        return (receipt['state'] == 'BACKUP_VERIFIED' and receipt['source'] == source
                and receipt['project'] == project and receipt['originalServicesResumed'] is True
                and boundary <= finished <= now and bool(receipt['id']))
    except (KeyError, TypeError, ValueError):
        return False

def decision(state, running, now, backup_ok=False):
    if state in ('DISABLED', 'STOPPED_FAULT', 'BACKUP_IN_PROGRESS'):
        return 'wait'
    if quiet_window(now):
        if running:
            return 'stop' if state != 'QUIESCING' else 'wait'
        return 'quiet'
    if state == 'QUIESCING':
        return 'fault' if running else 'quiet'
    if state == 'BACKUP_QUIET':
        return 'start' if backup_ok and not running else 'wait'
    if state == 'START_REQUESTED':
        return 'running' if running else 'start'
    if state == 'RUNNING':
        return 'running' if running else 'fault'
    return 'fault'

def private_path(path):
    p = Path(path)
    st = p.lstat()
    if p.is_symlink() or not p.is_file() or st.st_uid != os.getuid() or st.st_mode & 0o077 or st.st_size > 65536:
        raise RuntimeError('private_file_required')
    return p

def private_json(path):
    return json.loads(private_path(path).read_text())

def save(path, value):
    temporary = path.with_suffix('.new')
    with temporary.open('w') as stream:
        json.dump(value, stream, indent=2)
    os.chmod(temporary, 0o600)
    temporary.replace(path)

def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise RuntimeError('supervisor_operation_failed')
    return result.stdout.strip()

def worker_arguments(cfg):
    return ['--import', 'tsx', 'server/ainuoke-source/cli.ts', '--sync-run=' + cfg['sourceKey'],
            '--batch-size=5', '--config=/run/source.json', '--expected-target=' + cfg['expectedTarget']]

def inspect_owned(cfg):
    result = subprocess.run([DOCKER, 'inspect', cfg['containerName']], capture_output=True, text=True, timeout=20)
    if result.returncode:
        # A daemon error is not proof that the container is absent.
        command([DOCKER, 'info', '--format', '{{.ServerVersion}}'])
        names = command([DOCKER, 'ps', '-a', '--format', '{{.Names}}']).splitlines()
        if cfg['containerName'] in names:
            raise RuntimeError('container_result_unknown')
        return None
    info = json.loads(result.stdout)[0]
    labels = info['Config'].get('Labels') or {}
    mounts = info.get('Mounts', [])
    if (info['Image'] != cfg['image'] or labels.get('io.weaveops.catalog-sync') != 'v1'
            or labels.get('io.weaveops.source-key') != cfg['sourceKey']
            or info['Config'].get('Entrypoint') != ['node'] or info['Config'].get('Cmd') != worker_arguments(cfg)
            or not any(m.get('Source') == cfg['collectorFile'] and m.get('Destination') == '/run/source.json' and m.get('RW') is False for m in mounts)):
        raise RuntimeError('worker_identity_changed')
    return info

def tick(cfg, root, state):
    now = datetime.now(timezone.utc)
    worker = inspect_owned(cfg)
    running = bool(worker and worker['State']['Running'])
    old = private_json(cfg['oldStatusFile'])
    if old.get('state') != 'PAUSED':
        if running:
            command([DOCKER, 'kill', '--signal=TERM', cfg['containerName']])
        return {'state': 'STOPPED_FAULT', 'code': 'old_worker_not_paused', 'sourceRequests': 0}
    if not cfg['enabled']:
        if running:
            command([DOCKER, 'kill', '--signal=TERM', cfg['containerName']])
        return {'state': 'DISABLED', 'sourceRequests': 0}
    receipt = private_json(cfg['backupStatusFile'])
    okay = backup_verified(receipt, cfg['sourceSha'], cfg['project'], state.get('quietDate', ''), now)
    action = decision(state.get('state'), running, now, okay)
    if action == 'start':
        if not worker:
            # File ownership is also checked inside the existing CLI.
            private_json(cfg['collectorFile'])
            identity = private_json(cfg['identityFile'])
            if any(identity.get(key) != cfg[key] for key in ['sourceSha', 'image', 'sourceKey', 'expectedTarget']):
                raise RuntimeError('release_identity_changed')
            private_path(cfg['environmentFile'])
            args = [DOCKER, 'create', '--name', cfg['containerName'], '--network', cfg['network'],
                    '--user', str(os.getuid()) + ':' + str(os.getgid()), '--read-only', '--cap-drop=ALL',
                    '--security-opt=no-new-privileges', '--pids-limit=128', '--cpus=1', '--memory=1g',
                    '--log-driver=none', '--tmpfs=/tmp:rw,nosuid,nodev,size=67108864',
                    '--env-file', cfg['environmentFile'], '--mount', 'type=bind,src=' + cfg['collectorFile'] + ',dst=/run/source.json,readonly',
                    '--label', 'io.weaveops.catalog-sync=v1', '--label', 'io.weaveops.source-key=' + cfg['sourceKey'],
                    '--entrypoint=node', cfg['image'], *worker_arguments(cfg)]
            command(args)
        command([DOCKER, 'start', cfg['containerName']])
        return {'state': 'RUNNING', 'sourceSha': cfg['sourceSha'], 'startedAt': now.isoformat(), 'sourceRequests': 'worker-owned'}
    if action == 'stop':
        command([DOCKER, 'kill', '--signal=TERM', cfg['containerName']])
        return {'state': 'QUIESCING', 'quietDate': now.astimezone(BEIJING).date().isoformat(), 'sourceRequests': 0}
    if action == 'quiet':
        return {'state': 'BACKUP_QUIET', 'quietDate': state.get('quietDate', now.astimezone(BEIJING).date().isoformat()), 'sourceRequests': 0}
    if action == 'fault':
        return {'state': 'STOPPED_FAULT', 'code': 'worker_stopped_requires_review', 'sourceRequests': 0}
    if state.get('state') == 'QUIESCING' and now.astimezone(BEIJING).strftime('%H:%M') >= '03:20':
        return {'state': 'STOPPED_FAULT', 'code': 'worker_did_not_quiesce', 'sourceRequests': 0}
    return state

def main():
    import fcntl
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('--reason')
    parser.add_argument('action', choices=['tick', 'activate', 'backup-check', 'backup'])
    args = parser.parse_args()
    os.umask(0o077)
    cfg = private_json(args.config)
    if (cfg.get('schemaVersion') != 'weaveops-catalog-supervisor.v1' or type(cfg.get('enabled')) is not bool
            or not re.fullmatch(r'sha256:[a-f0-9]{64}', cfg.get('image', ''))
            or not re.fullmatch(r'[a-f0-9]{40}', cfg.get('sourceSha', ''))
            or not re.fullmatch(r'[a-f0-9]{64}', cfg.get('expectedTarget', ''))
            or not re.fullmatch(r'weaveops-catalog-sync-[a-f0-9]{8}', cfg.get('containerName', ''))
            or not re.fullmatch(r'[a-z][a-z0-9_-]{2,63}', cfg.get('sourceKey', ''))):
        raise RuntimeError('supervisor_configuration_invalid')
    root = Path(cfg['stateRoot']).resolve()
    if root != Path(args.config).resolve().parent or root.stat().st_uid != os.getuid() or root.stat().st_mode & 0o077:
        raise RuntimeError('private_root_required')
    with (root / '.supervisor.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('{"state":"SUPERVISOR_BUSY","sourceRequests":0}')
            return
        path = root / 'status.json'
        state = private_json(path) if path.exists() else {'state': 'DISABLED', 'sourceRequests': 0}
        if args.action in ('backup-check', 'backup'):
            worker = inspect_owned(cfg)
            if worker and worker['State']['Running'] or state.get('state') not in ('DISABLED', 'BACKUP_QUIET'):
                raise RuntimeError('backup_worker_not_quiet')
            if args.action == 'backup':
                previous = state
                began = datetime.now(timezone.utc)
                save(path, {'state': 'BACKUP_IN_PROGRESS', 'startedAt': began.isoformat(), 'sourceRequests': 0})
                try:
                    # Keep the same supervisor lock through the entire existing
                    # paired backup: the clock cannot restart a worker mid-backup.
                    result = subprocess.run(cfg['backupCommand'], capture_output=True, text=True, timeout=1800)
                    output = root / ('backup-' + uuid.uuid4().hex + '.log')
                    output.write_text(result.stdout + result.stderr)
                    os.chmod(output, 0o600)
                    receipt = private_json(cfg['backupStatusFile'])
                    finished = datetime.fromisoformat(receipt['finishedAt'].replace('Z', '+00:00'))
                    if (result.returncode or receipt.get('state') != 'BACKUP_VERIFIED' or receipt.get('source') != cfg['sourceSha']
                            or receipt.get('project') != cfg['project'] or not receipt.get('originalServicesResumed') or finished < began):
                        raise RuntimeError('paired_backup_not_verified')
                    save(path, previous)
                except Exception:
                    save(path, {'state': 'STOPPED_FAULT', 'code': 'backup_failed_requires_review', 'sourceRequests': 0})
                    raise
            print('{"state":"BACKUP_WORKER_QUIET","sourceRequests":0}')
            return
        if args.action == 'activate':
            if not cfg['enabled'] or state.get('state') == 'STOPPED_FAULT' and (not args.reason or len(args.reason.strip()) < 3):
                raise RuntimeError('activation_requires_review')
            state = {'state': 'START_REQUESTED', 'sourceRequests': 0, 'reviewReason': args.reason}
        else:
            state = tick(cfg, root, state)
        state['checkedAt'] = datetime.now(timezone.utc).isoformat()
        save(path, state)
        print(json.dumps(state))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"state":"SUPERVISOR_REQUIRES_REVIEW","sourceRequests":0}')
        raise SystemExit(1)
