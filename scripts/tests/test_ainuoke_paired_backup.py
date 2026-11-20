import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('paired_backup', Path(__file__).parents[1] / 'ainuoke_paired_backup.py')
backup = importlib.util.module_from_spec(spec)
with patch.object(sys, 'path', [str(Path(__file__).resolve().parents[1]), *sys.path]):
    spec.loader.exec_module(backup)


class BackupCommandTests(unittest.TestCase):
    def setUp(self):
        backup.COMMAND_EVENTS.clear()
        backup.CURRENT_STEP = 'snapshot'

    def test_success_records_metadata_without_output(self):
        self.assertEqual(backup.execute([sys.executable, '-c', "print('private-value')"]).strip(), b'private-value')
        event = backup.COMMAND_EVENTS[-1]
        self.assertEqual(event['step'], 'snapshot')
        self.assertEqual(event['result'], 'SUCCESS')
        self.assertEqual(event['timeoutSeconds'], 120)
        self.assertNotIn('private-value', json.dumps(event))

    def test_nonzero_is_distinct_and_does_not_log_stderr(self):
        with self.assertRaisesRegex(backup.Stop, 'command_exit_nonzero'):
            backup.execute([sys.executable, '-c', "import sys; print('private-value',file=sys.stderr); sys.exit(7)"])
        event = backup.COMMAND_EVENTS[-1]
        self.assertEqual(event['exitCode'], 7)
        self.assertNotIn('private-value', json.dumps(event))

    def test_start_failure_is_distinct(self):
        with self.assertRaisesRegex(backup.Stop, 'command_start_failed'):
            backup.execute(['no-such-weaveops-command-581922fc'])
        self.assertEqual(backup.COMMAND_EVENTS[-1]['errorCode'], 'command_start_failed')

    def test_snapshot_failure_preserves_timeout_classification(self):
        instance = object.__new__(backup.Backup)
        instance.snapshot_timeout_seconds = 300
        for original, expected in [('command_timeout', 'snapshot_timeout'), ('command_exit_nonzero', 'snapshot_failed')]:
            with self.subTest(original=original), patch.object(instance, 'sql', side_effect=backup.Stop(original)):
                with self.assertRaisesRegex(backup.Stop, expected):
                    instance.snapshot()

    def test_snapshot_policy_rejects_unbounded_or_ambiguous_budgets_before_io(self):
        for value in [True, False, None, '600', 300.0, 299, 601, -1]:
            with self.subTest(value=value), patch.object(backup, 'direct') as direct:
                with self.assertRaisesRegex(backup.Stop, 'snapshot_timeout_policy_invalid'):
                    backup.Backup({'snapshotTimeoutSeconds': value})
                direct.assert_not_called()

    def test_default_and_explicit_snapshot_budgets_keep_full_hash_contract(self):
        rows = [{'table': 'orders', 'count': 2, 'sha256': 'stable'},
                {'table': 'sequences', 'values': []}]
        for policy, expected in [({}, 300), ({'snapshotTimeoutSeconds': 600}, 600)]:
            with self.subTest(policy=policy):
                instance = object.__new__(backup.Backup)
                instance.p = {'tableCount': 1}
                instance.snapshot_timeout_seconds = backup.snapshot_timeout_seconds(policy)
                with patch.object(instance, 'sql', return_value=rows) as sql:
                    self.assertEqual(instance.snapshot(), {r['table']: r for r in rows})
                    sql.assert_called_once_with(backup.SNAPSHOT_SQL, timeout=expected)
                with patch.object(instance, 'sql', return_value=rows[:1]):
                    with self.assertRaisesRegex(backup.Stop, 'schema_changed_review_required'):
                        instance.snapshot()
                with patch.object(instance, 'sql', side_effect=backup.Stop('command_timeout')):
                    with self.assertRaisesRegex(backup.Stop, 'snapshot_timeout'):
                        instance.snapshot()

    @unittest.skipUnless(os.name == 'posix', 'process groups require POSIX')
    def test_timeout_terminates_local_process_group(self):
        with self.assertRaisesRegex(backup.Stop, 'command_timeout'):
            backup.execute([sys.executable, '-c', 'import time; time.sleep(30)'], timeout=0.2)
        event = backup.COMMAND_EVENTS[-1]
        self.assertTrue(event['timedOut'])
        with self.assertRaises(ProcessLookupError):
            os.killpg(event['pid'], 0)


if __name__ == '__main__':
    unittest.main()
