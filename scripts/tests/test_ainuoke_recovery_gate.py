import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

spec = importlib.util.spec_from_file_location('recovery_gate', Path(__file__).parents[1] / 'ainuoke_recovery_gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class RecoveryGateTests(unittest.TestCase):
    def evidence(self):
        return {key: True for key in ('admin_not_paused', 'backup_process_exited', 'backup_children_exited',
                'docker_exec_quiescent', 'backup_lock_released', 'database_healthy', 'migrations_current',
                'no_unknown_result', 'worker_exclusivity_verified')}

    def test_all_checks_are_required_and_indeterminate_is_blocked(self):
        self.assertIsNone(gate.can_recover_sync_worker(self.evidence()))
        for key in self.evidence():
            for bad in (None, False, 1):
                evidence = self.evidence()
                evidence[key] = bad
                with self.subTest(key=key, bad=bad):
                    self.assertIsNotNone(gate.can_recover_sync_worker(evidence))

    def test_docker_exec_status_and_errors_fail_closed(self):
        def fake(values):
            iterator = iter(values)
            def run(*args, **kwargs):
                value = next(iterator)
                if isinstance(value, Exception):
                    raise value
                return subprocess.CompletedProcess(args[0], 0, json.dumps(value), '')
            return run
        self.assertTrue(gate.docker_exec_quiescent('db', run=fake([None])))
        self.assertTrue(gate.docker_exec_quiescent('db', run=fake([[]])))
        self.assertFalse(gate.docker_exec_quiescent('db', run=fake([['one']])))
        self.assertFalse(gate.docker_exec_quiescent('db', run=fake([[None]])))
        self.assertFalse(gate.docker_exec_quiescent('db', run=fake([subprocess.TimeoutExpired('docker', 20)])))


if __name__ == '__main__':
    unittest.main()
