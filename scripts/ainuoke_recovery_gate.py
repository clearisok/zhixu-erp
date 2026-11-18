"""Fail-closed predicates for reconciliation; never issue Source requests.

The caller must obtain fresh evidence from the exact configured deployment and
hold its supervisor lock throughout the check and start. Absence of evidence is
not evidence of absence. This module does not itself start a worker.
"""
import json
import subprocess
import os
from pathlib import Path


def process_identity(pid):
    """Linux PID plus start ticks and boot ID; fail closed on inaccessible proc."""
    stat = Path('/proc', str(pid), 'stat').read_text()
    return {'pid': int(pid), 'startTicks': stat[stat.rfind(')') + 2:].split()[19],
            'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip()}


def process_exited(identity):
    try:
        if (not isinstance(identity, dict) or set(identity) != {'pid', 'startTicks', 'bootId'}
                or type(identity.get('pid')) is not int or identity['pid'] <= 1
                or not isinstance(identity['startTicks'], str) or not identity['startTicks'].isdigit()
                or not isinstance(identity['bootId'], str) or len(identity['bootId']) != 36):
            return False
        current = process_identity(identity['pid'])
        return current != identity
    except FileNotFoundError:
        # A missing /proc mount or boot-id file is missing evidence, not proof
        # that the process exited. Only an absent PID on a readable Linux proc
        # filesystem establishes that fact.
        try:
            boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
            if len(boot) != 36:
                return False
            try:
                os.stat('/proc/' + str(identity['pid']))
                return False
            except FileNotFoundError:
                return True
        except (OSError, KeyError, TypeError):
            return False
        return False
    except (OSError, ValueError, IndexError, KeyError):
        return False


def process_group_exited(pid):
    try:
        if not isinstance(pid, int) or pid <= 1:
            return False
        os.killpg(pid, 0)
        return False
    except ProcessLookupError:
        return True
    except (OSError, ValueError, AttributeError):
        return False


def docker_exec_quiescent(container, *, docker='/usr/bin/docker', run=subprocess.run):
    """Check every Docker exec session still associated with an exact container.

    An unavailable daemon, invalid inspection response, or an inspection race
    is indeterminate and returns False. This is one check, not a cleanup proof:
    locks, host processes and database activity must be checked separately.
    """
    try:
        result = run([docker, 'inspect', '--format', '{{json .ExecIDs}}', container],
                     capture_output=True, text=True, timeout=20, check=True)
        ids = json.loads(result.stdout)
        if ids is None:
            return True
        if not isinstance(ids, list) or any(not isinstance(item, str) or not item for item in ids):
            return False
        # Block on any listed session, including one in an uncertain state.
        # The Docker CLI has no `docker inspect --type exec` operation.
        return not ids
    except (OSError, ValueError, TypeError, subprocess.SubprocessError):
        return False


def can_recover_sync_worker(evidence):
    """Return a reason code; accept only explicit, positively verified evidence."""
    checks = (
        ('admin_not_paused', 'admin_paused_or_unknown'),
        ('backup_process_exited', 'backup_process_unknown'),
        ('backup_children_exited', 'backup_cleanup_unverified'),
        ('docker_exec_quiescent', 'backup_cleanup_unverified'),
        ('backup_lock_released', 'backup_lock_held_or_unknown'),
        ('database_healthy', 'database_unhealthy'),
        ('migrations_current', 'migration_mismatch'),
        ('no_unknown_result', 'unknown_remote_result'),
        ('worker_exclusivity_verified', 'worker_identity_unknown'),
    )
    if not isinstance(evidence, dict):
        return 'recovery_evidence_invalid'
    for key, reason in checks:
        if evidence.get(key) is not True:
            return reason
    return None


def recovery_gate_result(evidence):
    reason = can_recover_sync_worker(evidence)
    value = evidence if isinstance(evidence, dict) else {}
    return {'allowed': reason is None, 'reason': reason or 'all_recovery_checks_passed',
            'checks': {key: value.get(key) is True for key in (
                'admin_not_paused', 'backup_process_exited', 'backup_children_exited',
                'docker_exec_quiescent', 'backup_lock_released', 'database_healthy',
                'migrations_current', 'no_unknown_result', 'worker_exclusivity_verified')}}
