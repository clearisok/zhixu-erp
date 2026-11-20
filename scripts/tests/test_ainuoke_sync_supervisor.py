import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import unittest
import tempfile
import subprocess
import json
import sys
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('source_supervisor', Path(__file__).parents[1] / 'ainuoke_sync_supervisor.py')
module = importlib.util.module_from_spec(spec)
# The CI discovery command runs from tools/ainuoke-bridge. Loading a file
# explicitly does not add its sibling modules to Python's search path.
with patch.object(sys, 'path', [str(Path(__file__).resolve().parents[1]), *sys.path]):
    spec.loader.exec_module(module)

class SupervisorSafety(unittest.TestCase):
    def test_real_evidence_missing_configuration_is_nonempty_and_denied(self):
        evidence=module.recovery_evidence({}, {}, None)
        self.assertTrue(evidence)
        self.assertIsNotNone(evidence['collectionError'])
        self.assertFalse(module.recovery_gate_result(evidence)['allowed'])

    def test_backup_intent_binds_start_time_before_any_child_is_started(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'status.json'
            cfg={'backupCommand':['private-command']}
            def crash(*args,**kwargs):
                intent=json.loads(path.read_text())
                self.assertEqual(intent['backupBeganAt'],intent['startedAt'])
                self.assertEqual(intent['state'],'BACKUP_IN_PROGRESS')
                raise subprocess.TimeoutExpired('private-command',1800)
            with patch.object(module.subprocess,'run',side_effect=crash):
                with self.assertRaises(subprocess.TimeoutExpired):module.perform_backup(cfg,root,path,{'state':'BACKUP_QUIET'})

    def test_recovery_gate_blocks_every_unverified_condition(self):
        cfg={'enabled':True,'oldStatusFile':'old','containerName':'worker'}
        good={key:True for key in ('admin_not_paused','backup_process_exited','backup_children_exited',
              'docker_exec_quiescent','backup_lock_released','database_healthy','migrations_current',
              'no_unknown_result','worker_exclusivity_verified')}
        for key in good:
            with self.subTest(key=key), patch.object(module,'private_json',return_value={'state':'PAUSED'}), \
                 patch.object(module,'recovery_evidence',return_value={**good,key:False}), \
                 patch.object(module,'inspect_owned',return_value={'State':{'Running':False}}), \
                 patch.object(module,'quiet_window',return_value=False), patch.object(module,'command') as start:
                result=module.tick(cfg,Path('private'),{'state':'STOPPED_FAULT','code':'backup_failed_requires_review'})
                self.assertEqual(result['state'],'RECOVERY_BLOCKED')
                self.assertEqual(result['originalFault'],'backup_failed_requires_review')
                start.assert_not_called()

    def test_recovery_timeout_rejects_stale_post_start_heartbeat_without_restarting(self):
        cfg={'enabled':True,'oldStatusFile':'old','containerName':'worker'}
        evidence={key:True for key in ('admin_not_paused','backup_process_exited','backup_children_exited',
                  'docker_exec_quiescent','backup_lock_released','database_healthy','migrations_current',
                  'no_unknown_result','worker_exclusivity_verified')}
        state={'state':'RECOVERING','recoveryStartedAt':'2020-01-01T00:00:00+00:00',
               'recoveryDeadline':'2020-01-01T00:02:00+00:00'}
        # A supervisor restarted much later must not promote an old heartbeat
        # merely because it happened after the original recovery start.
        evidence['heartbeatAt']='2020-01-01T00:00:30+00:00'
        with patch.object(module,'private_json',return_value={'state':'PAUSED'}), \
             patch.object(module,'recovery_evidence',return_value=evidence), \
             patch.object(module,'inspect_owned',return_value={'State':{'Running':True}}), \
             patch.object(module,'quiet_window',return_value=False), patch.object(module,'command') as start:
            result=module.tick(cfg,Path('private'),state)
        self.assertEqual(result['state'],'RECOVERY_FAILED')
        start.assert_not_called()

    def test_recovery_simulation_waits_for_new_heartbeat_and_preserves_fault(self):
        class Clock(datetime):
            current='2026-11-05T04:00:00+08:00'
            @classmethod
            def now(cls, tz=None):
                return cls.fromisoformat(cls.current).astimezone(tz)
        cfg={'enabled':True,'oldStatusFile':'old','containerName':'worker','sourceSha':'candidate',
             'project':'trial','backupStatusFile':'backup'}
        evidence={key:True for key in ('admin_not_paused','backup_process_exited','backup_children_exited',
                  'docker_exec_quiescent','backup_lock_released','database_healthy','migrations_current',
                  'no_unknown_result','worker_exclusivity_verified')}
        state={'state':'STOPPED_FAULT','code':'backup_failed_requires_review'}
        with patch.object(module,'datetime',Clock), patch.object(module,'private_json',side_effect=lambda p: {'state':'PAUSED'} if p=='old' else {}), \
             patch.object(module,'recovery_evidence',return_value=evidence), patch.object(module,'command') as start, patch.object(module,'save'), \
             patch.object(module,'inspect_owned',return_value={'State':{'Running':False}}):
            state=module.tick(cfg,Path('private'),state)
        self.assertEqual(state['state'],'RECOVERING')
        self.assertEqual(state['originalFault'],'backup_failed_requires_review')
        start.assert_called_once_with([module.DOCKER,'start','worker'])
        Clock.current='2026-11-05T04:01:00+08:00'
        evidence['heartbeatAt']='2026-11-05T04:00:30+08:00'
        with patch.object(module,'datetime',Clock), patch.object(module,'private_json',return_value={'state':'PAUSED'}), \
             patch.object(module,'recovery_evidence',return_value=evidence), patch.object(module,'command') as start, \
             patch.object(module,'inspect_owned',return_value={'State':{'Running':True}}):
            state=module.tick(cfg,Path('private'),state)
        self.assertEqual(state['state'],'RUNNING')
        self.assertEqual(state['recoveryResult'],'heartbeat_verified')
        start.assert_not_called()

    def test_failed_backup_retains_redacted_receipt_and_reconciles_without_starting(self):
        cfg={'backupCommand':['private-command'], 'backupStatusFile':'backup', 'sourceSha':'candidate',
             'project':'trial', 'enabled':True, 'oldStatusFile':'old', 'containerName':'worker'}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            with patch.object(module.subprocess,'run',side_effect=subprocess.TimeoutExpired('secret-command',1800)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    module.perform_backup(cfg,root,root/'status.json',{'state':'BACKUP_QUIET'})
            state=json.loads((root/'status.json').read_text())
            record=json.loads(next(root.glob('backup-attempt-*.json')).read_text())
            self.assertEqual(record['errorCode'],'command_timeout')
            self.assertTrue(record['timedOut'])
            self.assertNotIn('secret-command',json.dumps(record))
            with patch.object(module,'inspect_owned',return_value={'State':{'Running':False}}), \
                 patch.object(module,'private_json',return_value={'state':'PAUSED'}), \
                 patch.object(module,'command') as start:
                reconciled=module.tick(cfg,root,state)
            self.assertEqual(reconciled['state'],'RECOVERY_BLOCKED')
            self.assertEqual(reconciled['recoveryAttemptCount'],1)
            start.assert_not_called()

    def test_failed_backup_distinguishes_start_and_exit_without_recording_output(self):
        cfg={'backupCommand':['private-command'], 'backupStatusFile':'backup', 'sourceSha':'candidate','project':'trial'}
        for outcome,expected in [(OSError('secret'),'command_start_failed'),
                                 (subprocess.CompletedProcess([],7,'secret','secret'),'command_exit_nonzero')]:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                root=Path(directory)
                with patch.object(module.subprocess,'run',side_effect=outcome if isinstance(outcome,Exception) else None,
                                  return_value=outcome), patch.object(module,'private_json',return_value={}):
                    with self.assertRaises((RuntimeError,OSError)):
                        module.perform_backup(cfg,root,root/'status.json',{'state':'BACKUP_QUIET'})
                record=json.loads(next(root.glob('backup-attempt-*.json')).read_text())
                self.assertEqual(record['errorCode'],expected)
                self.assertNotIn('secret',json.dumps(record))

    def test_interrupted_backup_reconciliation_respects_admin_disable(self):
        cfg={'enabled':False,'oldStatusFile':'old','containerName':'worker'}
        state={'state':'BACKUP_IN_PROGRESS','backupRunId':'interrupted'}
        with patch.object(module,'inspect_owned',return_value={'State':{'Running':False}}), \
             patch.object(module,'private_json',return_value={'state':'PAUSED'}), \
             patch.object(module,'command') as start:
            result=module.tick(cfg,Path('private'),state)
        self.assertEqual(result['state'],'DISABLED')
        start.assert_not_called()

    def test_egress_is_limited_to_the_same_owned_staging_project(self):
        cfg={'project':'trial','network':'trial_default','egressNetwork':'trial_ingress'}
        self.assertEqual(module.worker_networks(cfg),['trial_default','trial_ingress'])
        self.assertEqual(module.worker_networks({'network':'existing_internal'}),['existing_internal'])
        for bad in [{**cfg,'network':'bridge'},{**cfg,'egressNetwork':'host'},{**cfg,'egressNetwork':'other_ingress'}]:
            with self.assertRaisesRegex(RuntimeError,'owned_worker_networks_required'):
                module.worker_networks(bad)

    def test_reviewed_stopped_worker_backup_never_clears_pause_or_starts_worker(self):
        now = datetime.now(timezone.utc).isoformat()
        cfg = {'enabled': True, 'sourceKey': 'source', 'oldStatusFile': 'old'}
        state = {'state': 'RECOVERY_BLOCKED', 'originalFault': 'worker_stopped_requires_review'}
        health = {'checkedAt': now, 'databaseCheckedAt': now, 'databaseHealthy': True,
                  'migrationsCurrent': True, 'noUnknownResult': True, 'hasUnknownResult': False,
                  'workerLeaseHeld': False, 'adminNotPaused': False}
        original = json.loads(json.dumps(state))
        with patch.object(module, 'recovery_release_policy'), patch.object(module, 'private_json', return_value={'state': 'PAUSED'}), \
             patch.object(module, 'read_recovery_health', return_value=health), patch.object(module, 'command', return_value='') as command:
            module.require_reviewed_worker_backup(cfg, state, None, 'reviewed source pause')
        self.assertEqual(state, original)
        self.assertEqual(command.call_count, 1)
        self.assertEqual(command.call_args.args[0][1], 'ps')
        self.assertFalse(module.recovery_gate_result({'admin_not_paused': False})['allowed'])

    def test_reviewed_backup_rejects_every_unverified_health_condition(self):
        now = datetime.now(timezone.utc).isoformat()
        good = {'checkedAt': now, 'databaseCheckedAt': now, 'databaseHealthy': True,
                'migrationsCurrent': True, 'noUnknownResult': True, 'hasUnknownResult': False, 'workerLeaseHeld': False}
        for key, value in [('databaseHealthy', False), ('migrationsCurrent', False), ('noUnknownResult', False),
                           ('hasUnknownResult', True), ('workerLeaseHeld', True), ('checkedAt', '2020-01-01T00:00:00Z')]:
            with self.subTest(key=key), patch.object(module, 'recovery_release_policy'), \
                 patch.object(module, 'private_json', return_value={'state': 'PAUSED'}), \
                 patch.object(module, 'command', return_value=''), patch.object(module, 'read_recovery_health', return_value={**good, key: value}):
                with self.assertRaises(RuntimeError):
                    module.require_reviewed_worker_backup({'enabled': True, 'sourceKey': 'source', 'oldStatusFile': 'old'},
                        {'state': 'STOPPED_FAULT', 'code': 'worker_stopped_requires_review'}, None, 'reviewed')

    def test_reviewed_backup_refuses_unreviewed_unknown_or_running_owners_before_health(self):
        cfg = {'enabled': True, 'sourceKey': 'source', 'oldStatusFile': 'old'}
        good = {'state': 'RECOVERY_BLOCKED', 'originalFault': 'worker_stopped_requires_review'}
        for state, worker, reason in [(good, None, None), (good, None, 'x'),
                ({**good, 'state': 'RECOVERY_FAILED'}, None, 'reviewed'),
                ({**good, 'originalFault': 'unknown_fault'}, None, 'reviewed'),
                (good, {'State': {'Running': True}}, 'reviewed')]:
            with self.subTest(state=state, reason=reason), patch.object(module, 'read_recovery_health') as health:
                with self.assertRaises(RuntimeError):module.require_reviewed_worker_backup(cfg, state, worker, reason)
                health.assert_not_called()
        with patch.object(module, 'recovery_release_policy'), patch.object(module, 'private_json', return_value={'state': 'PAUSED'}), \
             patch.object(module, 'command', return_value='another-owner'), patch.object(module, 'read_recovery_health') as health:
            with self.assertRaisesRegex(RuntimeError, 'worker_identity_unknown'):
                module.require_reviewed_worker_backup(cfg, good, None, 'reviewed')
            health.assert_not_called()
        with patch.object(module, 'recovery_release_policy', side_effect=RuntimeError('release_identity_changed')), \
             patch.object(module, 'read_recovery_health') as health:
            with self.assertRaisesRegex(RuntimeError, 'release_identity_changed'):
                module.require_reviewed_worker_backup(cfg, good, None, 'reviewed')
            health.assert_not_called()

    def time(self, local):
        return datetime.fromisoformat('2026-11-05T' + local + ':00+08:00')

    def test_beijing_quiet_window_has_completion_buffer(self):
        self.assertFalse(module.quiet_window(self.time('03:11')))
        self.assertTrue(module.quiet_window(self.time('03:12')))
        self.assertTrue(module.quiet_window(self.time('03:49')))
        self.assertFalse(module.quiet_window(self.time('03:50')))
        self.assertTrue(module.quiet_window(self.time('03:20').astimezone(timezone.utc)))

    def test_backup_is_current_exact_source_and_services_resumed(self):
        receipt = {'state':'BACKUP_VERIFIED','source':'candidate','project':'trial','originalServicesResumed':True,'id':'bundle','finishedAt':'2026-11-05T03:35:00+08:00'}
        verify = lambda value: module.backup_verified(value,'candidate','trial','2026-11-05',self.time('03:50'))
        self.assertTrue(verify(receipt))
        for key,value in [('state','FAILED'),('source','old'),('project','other'),('originalServicesResumed',False),('finishedAt','2026-11-04T03:35:00+08:00'),('finishedAt','2026-11-05T04:00:00+08:00')]:
            self.assertFalse(verify({**receipt,key:value}))

    def test_faults_and_disabled_workers_never_restart_automatically(self):
        for state in ['STOPPED_FAULT','DISABLED','BACKUP_IN_PROGRESS']:
            self.assertEqual(module.decision(state,False,self.time('12:00'),True),'wait')
        self.assertEqual(module.decision('RUNNING',False,self.time('12:00')),'fault')

    def test_worker_command_is_fixed_and_contains_no_credentials(self):
        cfg={'sourceKey':'trusted_source','expectedTarget':'a'*64}
        args=module.worker_arguments(cfg)
        self.assertIn('--batch-size=5',args)
        self.assertIn('--sync-run=trusted_source',args)
        self.assertEqual(args[-2],'--config=/run/source.json')
        self.assertNotIn('password',' '.join(args))

    def test_planned_pause_needs_backup_and_sends_only_one_term(self):
        self.assertEqual(module.decision('RUNNING',True,self.time('03:12')),'stop')
        self.assertEqual(module.decision('QUIESCING',True,self.time('03:13')),'wait')
        self.assertEqual(module.decision('QUIESCING',False,self.time('03:15')),'quiet')
        self.assertEqual(module.decision('BACKUP_QUIET',False,self.time('03:49'),True),'quiet')
        self.assertEqual(module.decision('BACKUP_QUIET',False,self.time('03:50'),False),'wait')
        self.assertEqual(module.decision('BACKUP_QUIET',False,self.time('03:50'),True),'start')

    def test_tick_runs_the_same_verified_backup_before_restarting(self):
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                return cls.fromisoformat('2026-11-05T20:00:00+08:00').astimezone(tz)
        cfg={'enabled':True,'sourceSha':'candidate','project':'trial','oldStatusFile':'old',
             'backupStatusFile':'backup','containerName':'worker'}
        receipt={'state':'BACKUP_VERIFIED','source':'candidate','project':'trial','originalServicesResumed':True,
                 'id':'today','finishedAt':'2026-11-05T19:59:00+08:00'}
        state={'state':'BACKUP_QUIET','quietDate':'2026-11-05'}
        with patch.object(module,'datetime',Clock), patch.object(module,'inspect_owned',return_value={'State':{'Running':False}}), \
                patch.object(module,'private_json',side_effect=[{'state':'PAUSED'},{}]), \
                patch.object(module,'perform_backup',return_value=receipt) as backup, patch.object(module,'command') as command:
            result=module.tick(cfg,Path('private'),state)
        self.assertEqual(result['state'],'RUNNING')
        backup.assert_called_once_with(cfg,Path('private'),Path('private/status.json'),state)
        command.assert_called_once_with([module.DOCKER,'start','worker'])

    def test_minute_tick_catches_up_backup_skipped_by_cron_lock_collision(self):
        state={'state':'BACKUP_QUIET','quietDate':'2026-11-05'}
        stale={'state':'BACKUP_VERIFIED','source':'candidate','project':'trial','originalServicesResumed':True,
               'id':'yesterday','finishedAt':'2026-11-04T03:35:00+08:00'}
        due=lambda at: module.backup_due(state,False,stale,'candidate','trial',self.time(at))
        self.assertFalse(due('03:29'))
        self.assertTrue(due('03:30'))
        self.assertTrue(due('03:31'))
        self.assertTrue(due('20:00'))
        valid={**stale,'id':'today','finishedAt':'2026-11-05T03:35:00+08:00'}
        self.assertFalse(module.backup_due(state,False,valid,'candidate','trial',self.time('03:50')))
        self.assertFalse(module.backup_due(state,True,stale,'candidate','trial',self.time('20:00')))
        for name in ['DISABLED','STOPPED_FAULT','BACKUP_IN_PROGRESS','RUNNING','QUIESCING']:
            self.assertFalse(module.backup_due({**state,'state':name},False,stale,'candidate','trial',self.time('20:00')))
        self.assertFalse(module.backup_due({'state':'BACKUP_QUIET'},False,stale,'candidate','trial',self.time('20:00')))

if __name__ == '__main__':
    unittest.main()
