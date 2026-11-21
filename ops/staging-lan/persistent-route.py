#!/usr/bin/env python3
"""Own one networkd route drop-in; never rewrite Netplan or restart networking."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

DROP = Path('/etc/systemd/network/10-netplan-enp3s0.network.d/90-weaveops-staging-lan-163.conf')
RECEIPT = Path('/var/lib/weaveops-staging-lan-163/route.json')
BODY = b'# Owned by weaveops-staging-lan-163\n[Route]\nDestination=192.168.83.51/32\nGateway=192.168.66.1\nMetric=50\n'
SHA = hashlib.sha256(BODY).hexdigest()


def run(*args):
    return subprocess.check_output(args, text=True, timeout=20)


def routes():
    return json.loads(run('ip', '-j', '-4', 'route', 'show', 'exact', '192.168.83.51/32'))


def matching(route):
    return route.get('gateway') == '192.168.66.1' and route.get('dev') == 'enp3s0'


def write_receipt(state):
    RECEIPT.parent.mkdir(mode=0o700, exist_ok=True)
    if RECEIPT.parent.is_symlink() or RECEIPT.parent.stat().st_uid != 0:
        raise RuntimeError('Unsafe receipt directory')
    candidate = RECEIPT.with_suffix('.next')
    with candidate.open('x') as f:
        json.dump({'schema': 'weaveops-lan-networkd-route.v1', 'state': state,
                   'path': str(DROP), 'sha256': SHA}, f)
        f.write('\n')
    candidate.chmod(0o600)
    candidate.replace(RECEIPT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    before = routes()
    if any(not matching(route) for route in before):
        raise RuntimeError('Conflicting exact route; no change')
    print(json.dumps({'execute': args.execute, 'rollback': args.rollback,
                      'dropIn': str(DROP), 'route': BODY.decode(), 'before': before}))
    if not args.execute:
        return
    if os.geteuid() != 0:
        raise RuntimeError('Execute requires sudo; no change')
    if DROP.is_symlink() or RECEIPT.is_symlink():
        raise RuntimeError('Symlink rejected')
    saved = json.loads(RECEIPT.read_text()) if RECEIPT.exists() else None
    if args.rollback:
        if not saved or saved.get('state') != 'created' or saved.get('sha256') != SHA or DROP.read_bytes() != BODY:
            raise RuntimeError('Matching owned drop-in and receipt required')
        # Preserve office connectivity as an explicitly temporary rollback route.
        if not any(route.get('metric', 0) == 0 for route in before):
            run('ip', 'route', 'add', '192.168.83.51/32', 'via', '192.168.66.1', 'dev', 'enp3s0', 'proto', 'boot')
        DROP.unlink()
        run('networkctl', 'reload')
        current = routes()
        for route in current:
            if matching(route) and route.get('metric') == 50 and route.get('protocol') == 'static':
                run('ip', 'route', 'del', '192.168.83.51/32', 'via', '192.168.66.1', 'dev', 'enp3s0', 'proto', 'static', 'metric', '50')
        write_receipt('rolled_back')
        print('ROLLBACK_VERIFIED: owned persistent route removed; temporary office route retained')
        return
    if run('systemctl', 'is-active', 'systemd-networkd').strip() != 'active':
        raise RuntimeError('networkd is not active')
    status = run('networkctl', 'status', 'enp3s0', '--no-pager')
    if '/run/systemd/network/10-netplan-enp3s0.network' not in status or '192.168.66.69' not in status:
        raise RuntimeError('Expected networkd owner/address changed')
    if DROP.exists():
        if DROP.read_bytes() != BODY or not saved or saved.get('sha256') != SHA or saved.get('state') != 'created':
            raise RuntimeError('Unknown existing drop-in; no overwrite')
    else:
        if saved and saved.get('state') != 'rolled_back':
            raise RuntimeError('Unexpected receipt state')
        if any(route.get('metric') == 50 for route in before):
            raise RuntimeError('Unowned metric-50 route already exists')
        DROP.parent.mkdir(mode=0o755, exist_ok=True)
        if DROP.parent.is_symlink():
            raise RuntimeError('Unsafe drop-in parent')
        with DROP.open('xb') as f:
            f.write(BODY)
        DROP.chmod(0o644)
        write_receipt('created')
    # Only this .network drop-in changes. No netplan apply, link down, DHCP edit,
    # daemon restart, Docker operation, or default route mutation.
    run('networkctl', 'reload')
    after = routes()
    if not any(matching(route) and route.get('metric') == 50 and route.get('protocol') == 'static' for route in after):
        raise RuntimeError('Persistent route not observed; preserve receipt and inspect')
    # Retire only the exact original temporary route after its replacement exists.
    for route in after:
        if matching(route) and route.get('metric', 0) == 0 and route.get('protocol', 'boot') == 'boot':
            run('ip', 'route', 'del', '192.168.83.51/32', 'via', '192.168.66.1', 'dev', 'enp3s0', 'proto', 'boot')
    print(json.dumps({'state': 'PERSISTENT_ROUTE_VERIFIED', 'routes': routes(), 'rebootTested': False}))


if __name__ == '__main__':
    main()
