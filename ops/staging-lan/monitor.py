#!/usr/bin/env python3
"""Owner-only durable monitor; no external destination or secret reads."""
import datetime
import json
import os
from pathlib import Path
import stat
import subprocess
import socket
import ssl

ROOT = Path('/home/jackson/weaveops-staging-lan')


def evaluate(now, states, days, safe_permissions, origin_days=None):
    problems = []
    for name, hours in [('check', 2), ('renew', 36)]:
        state = states.get(name)
        if state is None:
            problems.append(name + '_missing')
            continue
        if not isinstance(state, dict):
            problems.append(name + '_invalid')
            continue
        if state.get('state') == 'failed':
            problems.append(name + '_failed')
        try:
            age = (now - datetime.datetime.fromisoformat(state['at'].replace('Z', '+00:00'))).total_seconds()
            if age < -300 or age > hours * 3600:
                problems.append(name + '_stale')
        except (KeyError, ValueError, TypeError, AttributeError):
            problems.append(name + '_invalid')
    if days < 21:
        problems.append('certificate_under_21_days')
    if origin_days is not None and origin_days < 21:
        problems.append('origin_certificate_under_21_days_or_unavailable')
    if not safe_permissions:
        problems.append('private_permissions')
    return problems


def main():
    if os.getuid() != 1000:
        raise SystemExit('Expected jackson')
    os.umask(0o077)
    now = datetime.datetime.now(datetime.timezone.utc)
    states = {}
    for name in ['check', 'renew']:
        p = ROOT / 'private' / ('certificate-' + name + '-status.json')
        try:
            states[name] = json.loads(p.read_text())
        except (OSError, ValueError):
            states[name] = None
    paths = [ROOT / 'private/cloudflare.ini', ROOT / 'tls/current/privkey.pem']
    safe = all(p.is_file() and not p.is_symlink() and p.stat().st_uid == 1000
               and stat.S_IMODE(p.stat().st_mode) == 0o600 for p in paths)
    safe = safe and all(p.is_dir() and not p.is_symlink() and p.stat().st_uid == 1000
                        and stat.S_IMODE(p.stat().st_mode) == 0o700
                        for p in [ROOT / 'private', ROOT / 'tls'])
    try:
        end = subprocess.check_output(['openssl', 'x509', '-in', str(ROOT / 'tls/current/fullchain.pem'), '-noout', '-enddate'], text=True, timeout=5).strip().split('=', 1)[1]
        expires = datetime.datetime.strptime(end, '%b %d %H:%M:%S %Y %Z').replace(tzinfo=datetime.timezone.utc)
        days = (expires - now).total_seconds() / 86400
    except (OSError, ValueError, subprocess.SubprocessError):
        days = -1
    # Original localhost certificate also expires; monitor without replacing it
    # or restarting the shared gateway/Tunnel/object services.
    try:
        context = ssl.create_default_context(cafile='/home/jackson/weaveops-staging-preview/runtime/tls/cert.pem')
        with socket.create_connection(('127.0.0.1', 3003), timeout=3) as raw:
            with context.wrap_socket(raw, server_hostname='localhost') as tls:
                origin_expires = ssl.cert_time_to_seconds(tls.getpeercert()['notAfter'])
        origin_days = (origin_expires - now.timestamp()) / 86400
    except (OSError, ValueError, KeyError, ssl.SSLError):
        origin_days = -1
    problems = evaluate(now, states, days, safe, origin_days)
    summary = {'schema': 'weaveops-lan-monitor.v1', 'at': now.isoformat(),
               'state': 'failed' if problems else 'healthy', 'problems': problems,
               'certificateDaysRemaining': round(days, 2),
               'originCertificateDaysRemaining': round(origin_days, 2),
               'externalNotificationConfigured': False}
    candidate = ROOT / 'private/monitor-status.json.next'
    candidate.write_text(json.dumps(summary) + '\n')
    candidate.chmod(0o600)
    candidate.replace(ROOT / 'private/monitor-status.json')
    if problems:
        subprocess.run(['logger', '-t', 'weaveops-staging-lan-monitor', '-p', 'user.err', ','.join(problems)], check=False)
    print(json.dumps(summary))
    return 1 if problems else 0


if __name__ == '__main__':
    raise SystemExit(main())
