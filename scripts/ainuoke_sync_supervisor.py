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
import time
import uuid
try:
    from ainuoke_recovery_gate import recovery_gate_result
except ModuleNotFoundError:
    from scripts.ainuoke_recovery_gate import recovery_gate_result

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

def backup_due(state, running, receipt, source, project, now):
    """Catch up a planned paired backup skipped by the cron/tick lock race.

    Faults remain sticky; this never bypasses verification or starts a worker.
    """
    if running or state.get('state') != 'BACKUP_QUIET':
        return False
    try:
        due = datetime.fromisoformat(state['quietDate'] + 'T03:30:00+08:00')
    except (KeyError, TypeError, ValueError):
        return False
    return now >= due and not backup_verified(receipt, source, project, state['quietDate'], now)


def perform_backup(cfg, root, path, previous):
    began = datetime.now(timezone.utc)
    began_clock = time.monotonic()
    run_id = str(uuid.uuid4())
    save(path, {'state': 'BACKUP_IN_PROGRESS', 'startedAt': began.isoformat(), 'backupRunId': run_id,
                'previousState': previous, 'sourceRequests': 0})
    code = 'backup_result_unknown'
    exit_code = None
    success = False
    try:
        result = subprocess.run(cfg['backupCommand'], capture_output=True, text=True, timeout=1800)
        exit_code = result.returncode
        code = 'command_killed' if exit_code < 0 else 'command_exit_nonzero' if exit_code else 'backup_receipt_invalid'
        if exit_code:
            raise RuntimeError(code)
        receipt = private_json(cfg['backupStatusFile'])
        finished = datetime.fromisoformat(receipt['finishedAt'].replace('Z', '+00:00'))
        if (result.returncode or receipt.get('state') != 'BACKUP_VERIFIED' or receipt.get('source') != cfg['sourceSha']
                or receipt.get('project') != cfg['project'] or not receipt.get('originalServicesResumed') or finished < began):
            raise RuntimeError('paired_backup_not_verified')
        save(path, previous)
        success = True
        return receipt
    except subprocess.TimeoutExpired:
        code = 'command_timeout'
        raise
    except OSError:
        code = 'command_start_failed'
        raise
    finally:
        # A durable, separate receipt must not contain command arguments, stdout,
        # stderr, credentials or customer data. Subprocess termination is not
        # evidence that grandchildren, including docker exec, have stopped.
        if not success:
            finished = datetime.now(timezone.utc)
            record = {'schemaVersion': 'weaveops-backup-attempt.v1', 'backupRunId': run_id,
                      'startedAt': began.isoformat(), 'finishedAt': finished.isoformat(),
                      'durationMs': round((time.monotonic() - began_clock) * 1000),
                      'step': 'backup_executor', 'errorCode': code, 'exitCode': exit_code,
                      'terminationSignal': -exit_code if exit_code is not None and exit_code < 0 else None,
                      'timedOut': code == 'command_timeout', 'recoveryStatus': 'RECOVERY_BLOCKED'}
            save(root / ('backup-attempt-' + run_id + '.json'), record)
            save(path, {'state': 'RECOVERY_BLOCKED', 'code': 'backup_cleanup_unverified',
                        'backupRunId': run_id, 'blockedAt': finished.isoformat(),
                        'lastCheckAt': finished.isoformat(), 'nextCheckAt': (finished + timedelta(minutes=5)).isoformat(),
                        'recoveryAttemptCount': 0, 'sourceRequests': 0})


def decision(state, running, now, backup_ok=False):
    if state in ('DISABLED', 'STOPPED_FAULT', 'BACKUP_IN_PROGRESS', 'RECOVERY_BLOCKED', 'RECOVERY_FAILED'):
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

def worker_networks(cfg):
    networks = [cfg['network']]
    if cfg.get('egressNetwork'):
        if (cfg['network'] != cfg['project'] + '_default'
                or cfg['egressNetwork'] != cfg['project'] + '_ingress'):
            raise RuntimeError('owned_worker_networks_required')
        networks.append(cfg['egressNetwork'])
    return networks

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
    if cfg.get('egressNetwork') and set(info.get('NetworkSettings', {}).get('Networks', {})) != set(worker_networks(cfg)):
        raise RuntimeError('worker_network_identity_changed')
    labels = info['Config'].get('Labels') or {}
    mounts = info.get('Mounts', [])
    if (info['Image'] != cfg['image'] or labels.get('io.weaveops.catalog-sync') != 'v1'
            or labels.get('io.weaveops.source-key') != cfg['sourceKey']
            or info['Config'].get('Entrypoint') != ['node'] or info['Config'].get('Cmd') != worker_arguments(cfg)
            or not any(m.get('Source') == cfg['collectorFile'] and m.get('Destination') == '/run/source.json' and m.get('RW') is False for m in mounts)):
        raise RuntimeError('worker_identity_changed')
    return info


def recovery_evidence(cfg, state, worker):
    """Fail closed until the trusted cleanup and DB probes are installed.

    Never derive positive cleanup evidence merely from a process exit code or
    an empty Docker ExecIDs list: detached container children may survive.
    """
    return {}


def recovery_heartbeat_is_fresh(evidence, state):
    try:
        heartbeat = datetime.fromisoformat(evidence['heartbeatAt'].replace('Z', '+00:00'))
        started = datetime.fromisoformat(state['recoveryStartedAt'].replace('Z', '+00:00'))
        return heartbeat.tzinfo is not None and started.tzinfo is not None and heartbeat > started
    except (KeyError, TypeError, ValueError):
        return False

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
    recovering = state.get('state') == 'RECOVERING'
    recovery_candidate = (state.get('state') in ('RECOVERY_BLOCKED', 'BACKUP_IN_PROGRESS', 'RECOVERING')
                          or state.get('state') == 'STOPPED_FAULT' and state.get('code') in
                          ('backup_failed_requires_review', 'worker_stopped_requires_review'))
    if recovery_candidate:
        if quiet_window(now):
            return {**state, 'state': 'RECOVERY_BLOCKED', 'code': 'backup_quiet_window',
                    'originalFault': state.get('originalFault', state.get('code')), 'lastCheckAt': now.isoformat()}
        evidence = recovery_evidence(cfg, state, worker)
        gate = recovery_gate_result(evidence)
        if not gate['allowed']:
            # Preserve the first fault across repeated checks, even when its
            # immediate blocked reason changes.
            return {**state, 'state': 'RECOVERY_BLOCKED', 'code': gate['reason'], 'recoveryChecks': gate['checks'],
                    'originalFault': state.get('originalFault', state.get('code')),
                    'blockedAt': state.get('blockedAt', now.isoformat()), 'lastCheckAt': now.isoformat(),
                    'nextCheckAt': (now + timedelta(minutes=5)).isoformat(),
                    'recoveryAttemptCount': state.get('recoveryAttemptCount', 0) + 1, 'sourceRequests': 0}
        if recovering:
            if running and recovery_heartbeat_is_fresh(evidence, state):
                return {**state, 'state': 'RUNNING', 'recoveryFinishedAt': now.isoformat(),
                        'recoveryResult': 'heartbeat_verified', 'sourceRequests': 'worker-owned'}
            try:
                deadline = datetime.fromisoformat(state['recoveryDeadline'])
            except (KeyError, TypeError, ValueError):
                deadline = now
            if not running or now >= deadline:
                return {**state, 'state': 'RECOVERY_FAILED', 'code': 'worker_heartbeat_timeout',
                        'recoveryFinishedAt': now.isoformat(), 'sourceRequests': 0}
            return state
        if running:
            # Do not start a duplicate; only a heartbeat later than this check
            # can establish that this particular recovery is alive.
            return {**state, 'state': 'RECOVERING', 'recoveryAttemptId': str(uuid.uuid4()),
                    'recoveryStartedAt': now.isoformat(), 'recoveryDeadline': (now + timedelta(minutes=2)).isoformat()}
        state = {**state, 'state': 'START_REQUESTED', 'originalFault': state.get('originalFault', state.get('code')),
                 'recoveryAttemptId': str(uuid.uuid4()), 'recoveryStartedAt': now.isoformat(),
                 'recoveryDeadline': (now + timedelta(minutes=2)).isoformat()}
    receipt = private_json(cfg['backupStatusFile'])
    if backup_due(state, running, receipt, cfg['sourceSha'], cfg['project'], now):
        receipt = perform_backup(cfg, root, root / 'status.json', state)
        now = datetime.now(timezone.utc)
    okay = backup_verified(receipt, cfg['sourceSha'], cfg['project'], state.get('quietDate', ''), now)
    action = decision(state.get('state'), running, now, okay)
    if action == 'start':
        if state.get('recoveryAttemptId'):
            # Persist a fail-closed intent before any Docker mutation. If this
            # process dies or Docker fails, a later tick must not blindly retry.
            save(root / 'status.json', {**state, 'state': 'RECOVERY_FAILED',
                                       'code': 'recovery_start_unconfirmed', 'sourceRequests': 0})
        if not worker:
            # File ownership is also checked inside the existing CLI.
            private_json(cfg['collectorFile'])
            identity = private_json(cfg['identityFile'])
            if any(identity.get(key) != cfg[key] for key in ['sourceSha', 'image', 'sourceKey', 'expectedTarget']):
                raise RuntimeError('release_identity_changed')
            private_path(cfg['environmentFile'])
            networks = worker_networks(cfg)
            if cfg.get('egressNetwork'):
                for network in json.loads(command([DOCKER, 'network', 'inspect', *networks])):
                    if (network.get('Labels', {}).get('com.docker.compose.project') != cfg['project']
                            or network.get('Name') not in networks
                            or bool(network.get('Internal')) != (network.get('Name') == cfg['network'])):
                        raise RuntimeError('worker_network_identity_changed')
            args = [DOCKER, 'create', '--name', cfg['containerName'], '--network', cfg['network'],
                    '--user', str(os.getuid()) + ':' + str(os.getgid()), '--read-only', '--cap-drop=ALL',
                    '--security-opt=no-new-privileges', '--pids-limit=128', '--cpus=1', '--memory=1g',
                    '--log-driver=none', '--tmpfs=/tmp:rw,nosuid,nodev,size=67108864',
                    '--env-file', cfg['environmentFile'], '--mount', 'type=bind,src=' + cfg['collectorFile'] + ',dst=/run/source.json,readonly',
                    '--label', 'io.weaveops.catalog-sync=v1', '--label', 'io.weaveops.source-key=' + cfg['sourceKey'],
                    '--entrypoint=node', cfg['image'], *worker_arguments(cfg)]
            command(args)
            if cfg.get('egressNetwork'):
                command([DOCKER, 'network', 'connect', cfg['egressNetwork'], cfg['containerName']])
                inspect_owned(cfg)
        command([DOCKER, 'start', cfg['containerName']])
        if state.get('recoveryAttemptId'):
            return {**state, 'state': 'RECOVERING', 'sourceRequests': 'worker-owned'}
        return {'state': 'RUNNING', 'sourceSha': cfg['sourceSha'], 'startedAt': now.isoformat(), 'sourceRequests': 'worker-owned'}
    if action == 'stop':
        command([DOCKER, 'kill', '--signal=TERM', cfg['containerName']])
        return {'state': 'QUIESCING', 'quietDate': now.astimezone(BEIJING).date().isoformat(), 'sourceRequests': 0}
    if action == 'quiet':
        quiet_date = now.astimezone(BEIJING).date().isoformat() if quiet_window(now) else state.get('quietDate')
        return {'state': 'BACKUP_QUIET', 'quietDate': quiet_date, 'sourceRequests': 0}
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
                # The minute tick and explicit operation use the same guarded
                # backup path while holding this exact supervisor lock.
                perform_backup(cfg, root, path, state)
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
