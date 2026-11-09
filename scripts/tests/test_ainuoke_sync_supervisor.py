import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('source_supervisor', Path(__file__).parents[1] / 'ainuoke_sync_supervisor.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SupervisorSafety(unittest.TestCase):
    def test_egress_is_limited_to_the_same_owned_staging_project(self):
        cfg={'project':'trial','network':'trial_default','egressNetwork':'trial_ingress'}
        self.assertEqual(module.worker_networks(cfg),['trial_default','trial_ingress'])
        self.assertEqual(module.worker_networks({'network':'existing_internal'}),['existing_internal'])
        for bad in [{**cfg,'network':'bridge'},{**cfg,'egressNetwork':'host'},{**cfg,'egressNetwork':'other_ingress'}]:
            with self.assertRaisesRegex(RuntimeError,'owned_worker_networks_required'):
                module.worker_networks(bad)

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
