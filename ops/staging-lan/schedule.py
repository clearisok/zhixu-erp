#!/usr/bin/env python3
"""Manage only the marked LAN certificate block in jackson's existing crontab."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path('/home/jackson/weaveops-staging-lan')
BEGIN = '# BEGIN weaveops-staging-lan-163 certificate schedules\n'
END = '# END weaveops-staging-lan-163 certificate schedules\n'
BLOCK = (BEGIN
         + '19 3,15 * * * umask 077; /usr/bin/bash ' + str(ROOT)
         + '/certificate.sh renew >> ' + str(ROOT) + '/private/acme/scheduler-renew.log 2>&1\n'
         + '37 * * * * umask 077; /usr/bin/bash ' + str(ROOT)
         + '/certificate.sh check >> ' + str(ROOT) + '/private/acme/scheduler-check.log 2>&1\n'
         + END).encode()
mode = sys.argv[1] if len(sys.argv) == 2 else 'plan'
if mode not in ('plan', 'install', 'remove', 'status') or os.getuid() != 1000:
    raise SystemExit('Expected jackson and plan/install/remove/status')
os.umask(0o077)
env = dict(os.environ, LC_ALL='C', PATH='/usr/bin:/bin')


def read_cron():
    result = subprocess.run(['/usr/bin/crontab', '-l'], capture_output=True, env=env, check=False)
    if result.returncode == 0:
        return result.stdout
    if result.returncode == 1 and result.stderr.startswith(b'no crontab for '):
        return b''
    raise SystemExit('Cannot read crontab; existing state unchanged')


before = read_cron()
start, end = BEGIN.encode(), END.encode()
has_block = start in before or end in before
if has_block:
    if before.count(start) != 1 or before.count(end) != 1 or BLOCK not in before:
        raise SystemExit('Unexpected managed block; no replacement')
    after = before.replace(BLOCK, b'', 1) if mode == 'remove' else before
else:
    after = before + (b'\n' if before and not before.endswith(b'\n') else b'') + BLOCK
    if mode == 'remove':
        after = before
print(json.dumps({'mode': mode, 'ownedBlockPresent': has_block,
                  'beforeSha256': hashlib.sha256(before).hexdigest(),
                  'wouldChange': before != after and mode != 'status'}))
if mode in ('plan', 'status') or before == after:
    raise SystemExit(0)
if mode == 'install':
    subprocess.run(['/usr/bin/systemctl', 'is-active', '--quiet', 'cron'], check=True, env=env)
    subprocess.run(['/usr/bin/bash', str(ROOT / 'certificate.sh'), 'check'], check=True, env=env)
private = ROOT / 'private'
if private.is_symlink() or private.stat().st_uid != 1000 or private.stat().st_mode & 0o077:
    raise SystemExit('Private directory ownership/mode mismatch')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup = private / ('crontab-before-' + stamp)
with backup.open('xb') as output:
    output.write(before)
fd, candidate = tempfile.mkstemp(prefix='crontab-candidate-', dir=private)
try:
    with os.fdopen(fd, 'wb') as output:
        output.write(after)
    if read_cron() != before:
        raise SystemExit('Concurrent crontab change detected; no mutation')
    subprocess.run(['/usr/bin/crontab', candidate], check=True, env=env)
    if read_cron() != after:
        raise SystemExit('Crontab verification mismatch; preserve backup and inspect')
finally:
    Path(candidate).unlink(missing_ok=True)
print(json.dumps({'state': 'SCHEDULE_' + mode.upper() + '_VERIFIED', 'backup': str(backup)}))
