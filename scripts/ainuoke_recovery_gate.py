"""Fail-closed predicates for reconciliation; never issue Source requests.

The caller must obtain fresh evidence from the exact configured deployment and
hold its supervisor lock throughout the check and start. Absence of evidence is
not evidence of absence. This module does not itself start a worker.
"""
import json
import subprocess


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
