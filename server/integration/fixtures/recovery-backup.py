"""Only the isolated test image invokes this failing backup command."""
import sys
import os
import json
import fcntl
import uuid
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, '/tools/source')
from scripts.ainuoke_paired_backup import execute, Stop, COMMAND_EVENTS, cleanup_evidence, private_json
from scripts.ainuoke_recovery_gate import process_identity

policy = json.loads(Path(sys.argv[2]).read_text())
root = Path(policy['backupRoot'])
with (root / '.backup.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    began = datetime.now(timezone.utc).isoformat()
    try:
        execute([sys.executable, '-c', 'raise SystemExit(7)'])
        raise AssertionError('failure injection did not fail')
    except Stop as error:
        resumed = all(json.loads(__import__('subprocess').check_output(['docker', 'inspect', row['id']]))[0]['State']['Running']
                      for row in policy['services'].values())
        result = {'contract': 'weaveops-paired-backup.v1', 'id': str(uuid.uuid4()), 'state': 'FAILED',
                  'code': str(error), 'startedAt': began, 'finishedAt': datetime.now(timezone.utc).isoformat(),
                  'project': policy['project'], 'source': policy['source'], 'executorProcess': process_identity(os.getpid()),
                  'originalServicesResumed': resumed, 'commandEvents': COMMAND_EVENTS,
                  'cleanup': cleanup_evidence(policy['services'], COMMAND_EVENTS, resumed)}
        private_json(root / 'status.json', result, replace=True)
raise SystemExit(1)
