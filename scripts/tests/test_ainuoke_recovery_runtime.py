"""Real Docker/PostgreSQL evidence E2E. Run only in the disposable test image.

No evidence collector is mocked. Source IO alone is replaced by the existing
in-memory SDK transport in that image's explicitly synthetic worker router.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import unittest
import uuid
import ipaddress
sys.path.insert(0, '/tools/source')
from scripts import ainuoke_sync_supervisor as supervisor


@unittest.skipUnless(os.environ.get('RECOVERY_TEST_IMAGE'), 'requires isolated Docker runtime')
class RecoveryRuntime(unittest.TestCase):
    def test_failed_backup_real_evidence_restart_and_safety_blocks(self):
        image=os.environ['RECOVERY_TEST_IMAGE']; sha=os.environ['RECOVERY_TEST_SOURCE']
        root=Path(os.environ['RECOVERY_TEST_ROOT']);root.mkdir(mode=0o700,exist_ok=True);os.chmod(root,0o700)
        backup_root=root/'backups';backup_root.mkdir(mode=0o700)
        project='zhixu-quote-trial-recovery-'+uuid.uuid4().hex[:8]
        network=project+'_default'; db=project+'-database-1'
        worker='weaveops-catalog-sync-'+sha[:8]
        containers=[]
        def docker(*args,check=True):
            return subprocess.run(['docker',*args],capture_output=True,text=True,timeout=120,check=check).stdout.strip()
        def put(name,value):
            path=root/name;path.write_text(json.dumps(value));os.chmod(path,0o600);return str(path)
        def action(name):
            value=subprocess.run(['node','--import','tsx','server/integration/fixtures/recovery-database.ts',name],
                capture_output=True,text=True,timeout=180,env={**os.environ,'DATABASE_URL':db_url})
            if value.returncode:raise AssertionError('fixture database action failed: '+name+' '+value.stderr[-1000:])
            return json.loads(value.stdout) if value.stdout else None
        def until(predicate):
            end=time.monotonic()+40
            while time.monotonic()<end:
                if predicate():return
                time.sleep(0.5)
            self.fail('isolated runtime did not reach expected state: '+json.dumps(getattr(self,'last_state',{})))
        try:
            occupied=[]
            for item in json.loads(docker('network','inspect',*docker('network','ls','-q').split())):
                occupied.extend(ipaddress.ip_network(row['Subnet']) for row in (item.get('IPAM',{}).get('Config') or []) if row.get('Subnet'))
            subnet=next(str(candidate) for candidate in ipaddress.ip_network('10.253.246.0/24').subnets(new_prefix=28)
                        if not any(candidate.overlaps(old) for old in occupied if old.version==4))
            docker('network','create','--internal','--subnet',subnet,'--label','com.docker.compose.project='+project,network)
            password='synthetic-'+uuid.uuid4().hex
            docker('run','-d','--name',db,'--network',network,'--label','com.docker.compose.project='+project,
                   '--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_USER=quote_trial','-e','POSTGRES_DB=quote_trial',
                   '-e','POSTGRES_PASSWORD='+password,'postgres:16-alpine');containers.append(db)
            # Attach only this runner to the new DB-only network; it can reach
            # neither Staging nor the real ERP through this fixture.
            runner=os.environ['HOSTNAME'];docker('network','connect',network,runner)
            db_url='postgresql://quote_trial:'+password+'@'+db+':5432/quote_trial'
            until(lambda: subprocess.run(['docker','exec',db,'pg_isready','-U','quote_trial'],capture_output=True).returncode==0)
            seeded=action('bootstrap');source=seeded['sourceKey']
            collector=put('collector.json',seeded['collector'])
            env=root/'worker.env';env.write_text('NODE_ENV=test\nZHIXU_IDENTITY_MODE=session\nDATABASE_URL='+db_url+'\n');os.chmod(env,0o600)
            check=json.loads(docker('run','--rm','--network',network,'--env-file',str(env),
                '--mount','type=bind,src='+collector+',dst=/run/source.json,readonly','--entrypoint','node',image,
                '--import','tsx','server/ainuoke-source/cli.ts','--check','--config=/run/source.json'))
            executor='/tools/source/server/integration/fixtures/recovery-backup.py'
            digest=supervisor.file_hash(executor)
            db_info=json.loads(docker('inspect',db))[0]
            (backup_root/'.backup.lock').touch(mode=0o600)
            policy=put('policy.json',{'source':sha,'project':project,'backupRoot':str(backup_root),
                'files':{executor:digest},'services':{'database':{'id':db_info['Id'],'image':db_info['Image']}}})
            identity=put('identity.json',{'sourceSha':sha,'image':image,'sourceKey':source,
                'expectedTarget':check['targetFingerprint'],'backupExecutorSha256':digest})
            cfg={'enabled':True,'sourceSha':sha,'image':image,'sourceKey':source,'expectedTarget':check['targetFingerprint'],
                 'project':project,'network':network,'containerName':worker,'stateRoot':str(root),
                 'collectorFile':collector,'environmentFile':str(env),'identityFile':identity,
                 'oldStatusFile':put('old.json',{'state':'PAUSED'}),'backupStatusFile':str(backup_root/'status.json'),
                 'backupCommand':['/usr/bin/python3',executor,'backup',policy],
                 'backupPolicyFile':policy,'backupExecutorSha256':digest}
            # Exercise the actual failed command and shared cleanup sampler.
            with self.assertRaises(RuntimeError):supervisor.perform_backup(cfg,root,root/'status.json',{'state':'BACKUP_QUIET'})
            failed=(backup_root/'status.json').read_bytes();receipt=json.loads(failed)
            self.assertEqual(receipt['state'],'FAILED');self.assertTrue(receipt['cleanup']['verified'])
            state=json.loads((root/'status.json').read_text())
            # The real collector checks the lock, process, Docker, CLI target,
            # PostgreSQL, migrations, administrator, queue and existing lease.
            with supervisor.recovery_backup_lock(cfg):
                evidence=supervisor.recovery_evidence(cfg,state,supervisor.inspect_owned(cfg))
            self.assertIsNone(evidence['collectionError'],str(evidence))
            self.assertTrue(all(evidence[k] for k in supervisor.recovery_gate_result({})['checks']),str(evidence))
            state=supervisor.tick(cfg,root,state);containers.append(worker)
            self.assertEqual(state['state'],'RECOVERING',str(state))
            def running():
                nonlocal state
                state=supervisor.tick(cfg,root,state)
                self.last_state=state
                return state['state']=='RUNNING'
            until(running)
            self.assertEqual(state['recoveryResult'],'heartbeat_verified')
            self.assertEqual((backup_root/'status.json').read_bytes(),failed)
            before=action('status')['complete'];action('due')
            until(lambda: action('status')['complete']>=before+2)
            self.assertEqual(action('status')['duplicates'],0)
            self.assertEqual(len(docker('ps','--filter','label=io.weaveops.source-key='+source,'--format','{{.ID}}').splitlines()),1)
            # No duplicate worker on a subsequent normal scheduler tick.
            self.assertEqual(supervisor.tick(cfg,root,state)['state'],'RUNNING')
            docker('stop','--time','10',worker)
            base={'state':'STOPPED_FAULT','code':'backup_failed_requires_review'}
            def blocked():
                result=supervisor.tick(cfg,root,dict(base));self.assertEqual(result['state'],'RECOVERY_BLOCKED',str(result))
                self.assertFalse(supervisor.inspect_owned(cfg)['State']['Running']);return result
            action('pause');self.assertEqual(blocked()['code'],'admin_paused_or_unknown');action('unpause')
            action('bad-migration');blocked();action('restore-migration')
            # Real held lock and daemon-owned exec both deny a restart.
            import fcntl
            with (backup_root/'.backup.lock').open('r+') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);self.assertEqual(blocked()['code'],'backup_lock_held_or_unknown')
            docker('exec','-d',db,'sleep','3');self.assertEqual(blocked()['code'],'backup_cleanup_unverified');time.sleep(3)
            docker('pause',db);blocked();docker('unpause',db)
            until(lambda: subprocess.run(['docker','exec',db,'pg_isready','-U','quote_trial'],capture_output=True).returncode==0)
            action('unknown');self.assertEqual(blocked()['code'],'unknown_remote_result')
            # Legacy status has no new positive cleanup proof. It stays stopped.
            legacy={k:v for k,v in receipt.items() if k not in ('cleanup','executorProcess')};put('backups/status.json',legacy)
            result=blocked();self.assertFalse(result['recoveryChecks']['backup_process_exited'])
            print('REAL_RECOVERY_E2E_PASS: failed backup retained; real evidence; new heartbeat; due work; safety blocks')
        finally:
            for name in reversed(containers):docker('rm','--force',name,check=False)
            if 'runner' in locals():docker('network','disconnect',network,runner,check=False)
            docker('network','rm',network,check=False)


if __name__=='__main__':unittest.main()
