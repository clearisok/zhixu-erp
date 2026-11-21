import contextlib
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('route', Path(__file__).with_name('persistent-route.py'))
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)
BOOT = {'gateway': '192.168.66.1', 'dev': 'enp3s0', 'protocol': 'boot'}
STATIC = {**BOOT, 'protocol': 'static', 'metric': 50}


class PersistentRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        p = Path(self.temp.name)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(route, 'DROP', p / 'network.d/owned.conf'))
        self.stack.enter_context(patch.object(route, 'RECEIPT', p / 'receipt/route.json'))
        self.stack.enter_context(patch.object(route.os, 'geteuid', return_value=0, create=True))
        # Model root ownership for this isolated fixture only. Linux CI runs as
        # an ordinary user; mocking geteuid alone does not change tempdir uid.
        self.receipt_uid = 0
        actual_stat = Path.stat

        def fixture_stat(path, *args, **kwargs):
            observed = actual_stat(path, *args, **kwargs)
            if path == route.RECEIPT.parent:
                fields = list(observed)
                fields[4] = self.receipt_uid
                return os.stat_result(fields)
            return observed

        self.stack.enter_context(patch.object(Path, 'stat', fixture_stat))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))

    def invoke(self, args, observations):
        def run(*args):
            if args[:2] == ('systemctl', 'is-active'):
                return 'active\n'
            if args[:2] == ('networkctl', 'status'):
                return '/run/systemd/network/10-netplan-enp3s0.network 192.168.66.69'
            return ''
        with patch.object(sys, 'argv', ['route', *args]), patch.object(route, 'routes', side_effect=observations), patch.object(route, 'run', side_effect=run) as commands:
            route.main()
            return commands.call_args_list

    def test_plan_does_not_write(self):
        self.invoke([], [[BOOT]])
        self.assertFalse(route.DROP.exists())

    def test_non_root_receipt_directory_is_rejected(self):
        self.receipt_uid = 1001
        with self.assertRaisesRegex(RuntimeError, 'Unsafe receipt directory'):
            route.write_receipt('created')
        self.assertFalse(route.RECEIPT.exists())

    def test_conflicting_route_fails_before_write(self):
        with self.assertRaisesRegex(RuntimeError, 'Conflicting'):
            self.invoke(['--execute'], [[{**BOOT, 'gateway': '192.168.66.254'}]])
        self.assertFalse(route.DROP.exists())

    def test_unknown_dropin_is_not_overwritten(self):
        route.DROP.parent.mkdir()
        route.DROP.write_text('foreign')
        with self.assertRaisesRegex(RuntimeError, 'Unknown'):
            self.invoke(['--execute'], [[BOOT]])
        self.assertEqual(route.DROP.read_text(), 'foreign')

    def test_foreign_metric_50_route_not_claimed(self):
        with self.assertRaisesRegex(RuntimeError, 'Unowned'):
            self.invoke(['--execute'], [[STATIC]])
        self.assertFalse(route.DROP.exists())

    def test_installs_and_retires_only_exact_boot_route(self):
        commands = self.invoke(['--execute'], [[BOOT], [BOOT, STATIC], [STATIC]])
        self.assertEqual(route.DROP.read_bytes(), route.BODY)
        deletions = [c.args for c in commands if c.args[:3] == ('ip', 'route', 'del')]
        self.assertEqual(deletions, [('ip', 'route', 'del', '192.168.83.51/32', 'via', '192.168.66.1', 'dev', 'enp3s0', 'proto', 'boot')])

    def test_no_temporary_removal_until_static_observed(self):
        with self.assertRaisesRegex(RuntimeError, 'not observed'):
            self.invoke(['--execute'], [[BOOT], [BOOT]])
        self.assertTrue(route.RECEIPT.exists())

    def test_iproute_omitted_default_protocol_is_boot(self):
        implicit = {k: v for k, v in BOOT.items() if k != 'protocol'}
        commands = self.invoke(['--execute'], [[implicit], [implicit, STATIC], [STATIC]])
        self.assertTrue(any(c.args[-2:] == ('proto', 'boot') for c in commands))

    def test_rollback_without_receipt_refuses(self):
        with self.assertRaisesRegex(RuntimeError, 'Matching owned'):
            self.invoke(['--execute', '--rollback'], [[BOOT]])

    def test_rollback_restores_temporary_and_removes_only_owned_static(self):
        route.DROP.parent.mkdir()
        route.DROP.write_bytes(route.BODY)
        route.write_receipt('created')
        commands = self.invoke(['--execute', '--rollback'], [[STATIC], [BOOT, STATIC]])
        self.assertFalse(route.DROP.exists())
        self.assertIn(('ip', 'route', 'add', '192.168.83.51/32', 'via', '192.168.66.1', 'dev', 'enp3s0', 'proto', 'boot'), [c.args for c in commands])


if __name__ == '__main__':
    unittest.main()
