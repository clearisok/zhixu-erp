"""POSIX isolated fault tests. Fake tools/keys; never ACME, Docker, or real TLS.

The production script is copied only into a disposable fixture with its fixed
root and tool path rewritten. Actual trusted TLS/reload is a separate live test.
"""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


@unittest.skipIf(os.name == 'nt', 'POSIX shell/symlink fixture runs on Linux CI')
class PublicationTests(unittest.TestCase):
    def fixture(self, mode):
        temp = tempfile.TemporaryDirectory(prefix='weaveops-cert-fixture-')
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        for directory in ['private/acme/config/renewal', 'private/acme/config/live/staging-weaveops-lan-163', 'tls', 'bin']:
            (root / directory).mkdir(parents=True, exist_ok=True)
        (root / 'private/cloudflare.ini').write_text('synthetic-placeholder-never-sent')
        (root / 'private/cloudflare.ini').chmod(0o600)
        (root / 'private/acme/config/renewal/staging-weaveops-lan-163.conf').write_text('fixture')
        old = 'certificate-' + hashlib.sha256(b'old').hexdigest()
        new = 'certificate-' + hashlib.sha256(b'new').hexdigest()
        (root / 'tls' / old).mkdir()
        for filename in ['fullchain.pem', 'privkey.pem']:
            (root / 'tls' / old / filename).write_text('old')
            (root / 'private/acme/config/live/staging-weaveops-lan-163' / filename).write_text('old' if mode == 'unchanged' else 'new')
        (root / 'tls/current').symlink_to(old)
        scripts = {
            'docker': '''#!/bin/sh
case "$1" in
 image) echo sha256:6d5e1e84f687ce81786c97cbeccb9dda94d86bbb29a81dbb85527bd68008d77d;;
 run) exit 0;;
 ps) echo synthetic-ingress;;
 exec) echo "$*" >> "''' + str(root / 'commands') + '''"; if [ "''' + mode + '''" = syntax-fail ] && [ "$4" = -t ]; then exit 1; fi;;
 *) exit 99;;
esac
''',
            'openssl': '#!/bin/sh\nprintf "synthetic-public-key\\n"\n',
            'python3': '''#!/bin/sh
cat >/dev/null
if [ "''' + mode + '''" = mismatch ] && [ "$(readlink "''' + str(root / 'tls/current') + '''")" = "''' + new + '''" ]; then exit 1; fi
exit 0
''',
            'logger': '#!/bin/sh\nexit 0\n',
            'sleep': '#!/bin/sh\nexit 0\n',
            'id': '#!/bin/sh\necho 1000\n',
            'stat': '''#!/bin/sh
if [ "$2" = %u ]; then echo 1000; else /usr/bin/stat "$@"; fi
''',
        }
        for name, body in scripts.items():
            (root / 'bin' / name).write_text(body)
            (root / 'bin' / name).chmod(0o700)
        source = Path(__file__).with_name('certificate.sh').read_text()
        self.assertEqual(source.count('ROOT=/home/jackson/weaveops-staging-lan'), 1)
        source = source.replace('ROOT=/home/jackson/weaveops-staging-lan', 'ROOT=' + str(root))
        source = source.replace('export PATH=/usr/bin:/bin', 'export PATH=' + str(root / 'bin') + ':/usr/bin:/bin\n[[ $(command -v docker) = ' + str(root / 'bin/docker') + ' ]] || exit 99')
        script = root / 'fixture.sh'
        script.write_text(source)
        result = subprocess.run(['bash', str(script), 'renew'], capture_output=True, text=True, timeout=15)
        commands = (root / 'commands').read_text() if (root / 'commands').exists() else ''
        return root, old, new, result, commands

    def test_publish_new_version_reloads_and_verifies(self):
        root, _, new, result, commands = self.fixture('success')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(os.readlink(root / 'tls/current'), new)
        self.assertEqual(commands.count('nginx -s reload'), 1)

    def test_not_due_does_not_reload(self):
        root, old, _, result, commands = self.fixture('unchanged')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(os.readlink(root / 'tls/current'), old)
        self.assertEqual(commands, '')

    def test_wrong_served_fingerprint_restores_old_and_reloads(self):
        root, old, _, result, commands = self.fixture('mismatch')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(os.readlink(root / 'tls/current'), old)
        self.assertEqual(commands.count('nginx -s reload'), 2)

    def test_nginx_syntax_failure_keeps_old_version(self):
        root, old, _, result, commands = self.fixture('syntax-fail')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(os.readlink(root / 'tls/current'), old)
        self.assertNotIn('nginx -s reload', commands)


if __name__ == '__main__':
    unittest.main()
