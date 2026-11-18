import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('paired_backup', Path(__file__).parents[1] / 'ainuoke_paired_backup.py')
backup = importlib.util.module_from_spec(spec)
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
        for original, expected in [('command_timeout', 'snapshot_timeout'), ('command_exit_nonzero', 'snapshot_failed')]:
            with self.subTest(original=original), patch.object(instance, 'sql', side_effect=backup.Stop(original)):
                with self.assertRaisesRegex(backup.Stop, expected):
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
