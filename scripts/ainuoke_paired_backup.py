#!/usr/bin/env python3
"""Pinned Linux trial backup. Never migrate, restore, prune, or call a source API."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid
try:
    from ainuoke_recovery_gate import process_identity, process_group_exited, docker_exec_quiescent
except ModuleNotFoundError:
    from scripts.ainuoke_recovery_gate import process_identity, process_group_exited, docker_exec_quiescent


class Stop(RuntimeError):
    pass

COMMAND_EVENTS = []
CURRENT_STEP = 'initialization'


def cleanup_evidence(services, events, services_resumed):
    """Same positive cleanup sampler for executor receipts and isolated tests."""
    groups_clear = all(e.get('processGroupExited') is True and
                       (e.get('pid') is None or process_group_exited(e['pid'])) for e in events)
    commands_certain = all(not e.get('timedOut') and e.get('errorCode') not in
                           ('command_killed', 'cleanup_failed') for e in events)
    execs_clear = False
    attempts = 0
    # A Docker HEALTHCHECK may briefly own an exec after service restoration.
    # Resample positive absence within a fixed bound; never accept an ongoing
    # or inaccessible exec, change a prior receipt, or forgive a timed-out child.
    maximum_attempts = 3 if groups_clear and commands_certain and services_resumed is True else 1
    for attempt in range(maximum_attempts):
        attempts += 1
        execs_clear = bool(services)
        try:
            for service in services.values():
                actual = json.loads(subprocess.run(['docker', 'inspect', service['id']],
                    capture_output=True, text=True, timeout=20, check=True).stdout)[0]
                if actual.get('Id') != service['id'] or actual.get('Image') != service['image']:
                    execs_clear = False
                execs_clear = docker_exec_quiescent(service['id'], docker='docker') is True and execs_clear
        except (OSError, ValueError, KeyError, IndexError, subprocess.SubprocessError):
            execs_clear = False
        if execs_clear or attempt + 1 == maximum_attempts:
            break
        time.sleep(0.5)
    return {'schemaVersion': 'weaveops-backup-cleanup.v1', 'commandGroupsExited': groups_clear,
            'commandsCertain': commands_certain, 'dockerExecQuiescent': execs_clear,
            'execObservationAttempts': attempts, 'observedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'verified': groups_clear and commands_certain and execs_clear and services_resumed is True}


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def private_json(path, value, replace=False):
    path = Path(path)
    tmp = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    with open(tmp, "x", encoding="utf-8") as stream:
        os.chmod(tmp, 0o600)
        json.dump(value, stream, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    if not replace and path.exists():
        raise Stop("receipt_already_exists")
    os.replace(tmp, path)


def direct(path, directory=False):
    p = Path(path)
    if not p.is_absolute() or p.resolve() != p or p.is_symlink():
        raise Stop("direct_absolute_path_required")
    if directory and not p.is_dir():
        raise Stop("directory_required")
    return p


def execute(args, *, data=None, input_stream=None, output=None, timeout=120):
    started = dt.datetime.now(dt.timezone.utc)
    clock = time.monotonic()
    event = {'step': CURRENT_STEP, 'command': Path(args[0]).name,
             'startedAt': started.isoformat(), 'pid': None, 'exitCode': None,
             'signal': None, 'timedOut': False, 'result': 'FAILED',
             'timeoutSeconds': timeout,
             'stdoutExcerpt': '[suppressed]', 'stderrExcerpt': '[suppressed]'}
    process = None
    try:
        process = subprocess.Popen(args, stdin=input_stream if input_stream is not None else subprocess.PIPE if data is not None else subprocess.DEVNULL,
                                   stdout=output if output is not None else subprocess.PIPE,
                                   stderr=subprocess.PIPE, start_new_session=True)
        event['pid'] = process.pid
        try:
            stdout, _ = process.communicate(input=data, timeout=timeout)
        except subprocess.TimeoutExpired:
            event['timedOut'] = True
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
            # docker exec descendants are owned by the daemon; killing its CLI
            # does not prove they exited. The supervisor must fail closed.
            event['errorCode'] = 'command_timeout'
            raise Stop('command_timeout') from None
        event['exitCode'] = process.returncode
        if process.returncode:
            event['signal'] = -process.returncode if process.returncode < 0 else None
            event['errorCode'] = 'command_killed' if process.returncode < 0 else 'command_exit_nonzero'
            raise Stop(event['errorCode'])
        event['result'] = 'SUCCESS'
        return stdout or b''
    except OSError:
        event['errorCode'] = 'command_start_failed'
        raise Stop('command_start_failed') from None
    finally:
        if process is not None and process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.communicate()
            except (OSError, subprocess.SubprocessError):
                event['errorCode'] = 'cleanup_failed'
        event['finishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        event['durationMs'] = round((time.monotonic() - clock) * 1000)
        event['processGroupExited'] = process is None or process_group_exited(process.pid)
        COMMAND_EVENTS.append(event)


def read_config(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        key, value = line.split("=", 1)
        if not re.fullmatch(r"[A-Z_][A-Z0-9_]*", key) or key in result:
            raise Stop("invalid_config")
        result[key] = value
    return result


SNAPSHOT_SQL = r"""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format($snapshot$SELECT json_build_object('table',%L,'count',count(*),'sha256',encode(digest(coalesce(string_agg(row_sha256,'' ORDER BY row_sha256),''),'sha256'),'hex'))::text FROM (SELECT encode(digest(to_jsonb(t)::text,'sha256'),'hex') AS row_sha256 FROM %I.%I t) hashes;$snapshot$,tablename,schemaname,tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
SELECT json_build_object('table','sequences','values',coalesce(jsonb_agg(to_jsonb(s) ORDER BY sequencename),'[]'::jsonb))::text FROM pg_sequences s WHERE schemaname='public';
COMMIT;
"""


def snapshot_timeout_seconds(policy):
    # Existing targets retain their reviewed five-minute budget. Larger targets
    # may opt into a bounded ten-minute budget through the pinned private policy.
    value = policy.get('snapshotTimeoutSeconds', 300)
    if type(value) is not int or not 300 <= value <= 600:
        raise Stop('snapshot_timeout_policy_invalid')
    return value


class Backup:
    def __init__(self, policy):
        self.snapshot_timeout_seconds = snapshot_timeout_seconds(policy)
        self.p = policy
        self.root = direct(policy["backupRoot"], directory=True)
        self.project = policy["project"]
        if not re.fullmatch(r"zhixu-quote-trial-[a-z0-9-]{3,40}", self.project):
            raise Stop("project_invalid")
        self.db = self.project + "-database-1"
        self.config = direct(policy["config"])
        self.cli = direct(policy["cli"])
        self.before = None
        self.frozen = False

    def sql(self, sql, timeout=60):
        raw = execute(["docker", "exec", "-i", self.db, "psql", "-X", "-q", "-w",
                       "-U", "quote_trial", "-d", "quote_trial", "-At", "-v", "ON_ERROR_STOP=1"],
                      data=sql.encode(), timeout=timeout)
        return [json.loads(line) for line in raw.splitlines() if line.strip()]

    def snapshot(self):
        try:
            rows = self.sql(SNAPSHOT_SQL, timeout=self.snapshot_timeout_seconds)
        except Stop as error:
            raise Stop('snapshot_timeout' if str(error) == 'command_timeout' else 'snapshot_failed') from None
        if len(rows) != self.p["tableCount"] + 1:
            raise Stop("schema_changed_review_required")
        return {r["table"]: r for r in rows}

    def inspect(self):
        ids = execute(["docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=" + self.project]).split()
        if not ids:
            raise Stop("project_absent")
        values = json.loads(execute(["docker", "inspect", *[i.decode() for i in ids]]))
        result = {}
        for v in values:
            labels = v["Config"].get("Labels") or {}
            service = labels.get("com.docker.compose.service")
            if service in result or labels.get("com.docker.compose.project") != self.project:
                raise Stop("ambiguous_project")
            result[service] = {"id": v["Id"], "image": v["Image"], "running": v["State"]["Running"],
                               "mounts": [{"name": m.get("Name"), "destination": m["Destination"], "rw": m["RW"]}
                                          for m in v["Mounts"] if m["Type"] == "volume"]}
        return result

    def validate(self, require_running=True, check_disk=True):
        if os.getuid() != self.p["uid"] or self.root.stat().st_mode & 0o077:
            raise Stop("private_owner_required")
        for path, expected in self.p["files"].items():
            if digest(direct(path)) != expected:
                raise Stop("pinned_file_changed_review_required")
        cfg = read_config(self.config)
        if (cfg.get("TRIAL_PROJECT") != self.project or cfg.get("TRIAL_LOCAL_OBJECTS") != "true"
                or cfg.get("TRIAL_COMMIT") != self.p["source"]
                or cfg.get("TRIAL_IMAGE") != self.p["services"]["app"]["image"]):
            raise Stop("config_identity_changed")
        actual = self.inspect()
        if actual.keys() != self.p["services"].keys():
            raise Stop("service_set_changed")
        for name, expected in self.p["services"].items():
            row = actual[name]
            if any(row[key] != expected[key] for key in ["id", "image", "mounts"]):
                raise Stop("service_identity_changed")
            if require_running and not row["running"]:
                raise Stop("existing_service_not_running")
        for suffix in ["data", "objects", "appsecrets", "objectsecrets"]:
            value = json.loads(execute(["docker", "volume", "inspect", self.project + "_" + suffix]))[0]
            if value.get("Labels", {}).get("com.docker.compose.project") != self.project:
                raise Stop("volume_owner_changed")
        identity = self.sql("BEGIN READ ONLY; SELECT json_build_object('db',current_database(),'address',coalesce(inet_server_addr()::text,'local_socket'),'port',current_setting('port'),'version',current_setting('server_version_num'))::text; COMMIT;")[0]
        fingerprint = hashlib.sha256((self.project + "|" + self.db + "|" + self.project + "_data|" + identity["db"] + "|" + identity["address"] + "|" + identity["port"]).encode()).hexdigest()
        if fingerprint != self.p["fingerprint"] or identity["version"] != self.p["postgresVersion"]:
            raise Stop("database_identity_changed")
        if check_disk and shutil.disk_usage(self.root).free < self.p["minimumFreeBytes"]:
            raise Stop("low_disk_space_no_deletion_performed")
        return actual

    def trial(self, action, *extra):
        return execute(["node", str(self.cli), action, str(self.config), "--execute=" + self.project, *extra], timeout=240)

    def no_clients(self):
        row = self.sql("BEGIN READ ONLY; SELECT json_build_object('clients',count(*))::text FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'; COMMIT;")[0]
        if row["clients"]:
            raise Stop("other_database_clients_present")

    def resume(self):
        # Exact original containers only: no compose up, replacement, init or migration.
        self.validate(require_running=False, check_disk=False)
        execute(["docker", "start", self.p["services"]["app"]["id"], self.p["services"]["gateway"]["id"]], timeout=60)
        end = time.monotonic() + 90
        cfg = read_config(self.config)
        while time.monotonic() < end:
            try:
                raw = execute(["curl", "--silent", "--show-error", "--fail", "--max-time", "5", "--noproxy", "*",
                               "--cacert", cfg["TRIAL_TLS_CA_FILE"], cfg["TRIAL_HTTPS_ORIGIN"] + "/build-info.json"], timeout=10)
                if json.loads(raw).get("gitCommit") == self.p["source"]:
                    execute(["docker", "exec", self.p["services"]["gateway"]["id"], "node", "/trial/gateway-health.mjs"], timeout=15)
                    self.frozen = False
                    return
            except (Stop, ValueError):
                pass
            time.sleep(2)
        raise Stop("resume_readiness_failed")

    def recovery_material(self, dest):
        dest.mkdir(mode=0o700)
        files = {}
        for source in self.p["files"]:
            relative = str(Path(source).relative_to(self.p["runtimeRoot"]))
            target = dest / relative
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            shutil.copyfile(source, target)
            os.chmod(target, 0o600)
            files[relative] = digest(target)
        for service in ["app", "objects"]:
            target = dest / (service + "-secrets")
            target.mkdir(mode=0o700)
            execute(["docker", "cp", self.p["services"][service]["id"] + ":/run/secrets/.", str(target)])
            for file in target.rglob("*"):
                if file.is_symlink():
                    raise Stop("secret_symlink_unexpected")
                os.chmod(file, 0o700 if file.is_dir() else 0o600)
        private_json(dest / "target-policy.json", self.p)

    def run(self):
        global CURRENT_STEP
        COMMAND_EVENTS.clear()
        import fcntl  # Linux operator only; import remains testable on Windows.
        os.umask(0o077)
        lock = open(self.root / ".backup.lock", "a")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop("backup_already_running") from None
        name = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8]
        bundle = self.root / "bundles" / name
        result = {"contract": "weaveops-paired-backup.v1", "id": name, "project": self.project,
                  "source": self.p["source"], "state": "RUNNING", "startedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                  "sourceRequests": 0, "businessWrites": 0, "deletedAssets": 0, "snapshotAlgorithm": "row-sha256-multiset-v2"}
        result['snapshotTimeoutSeconds'] = self.snapshot_timeout_seconds
        result['executorProcess'] = process_identity(os.getpid())
        try:
            CURRENT_STEP = 'validate'
            self.validate()
            # Do not freeze a user who is actively saving or uploading.
            unfinished = self.sql("BEGIN READ ONLY; SELECT json_build_object('unfinished',count(*))::text FROM quote_attachments WHERE lifecycle<>'available'; COMMIT;")[0]
            if unfinished["unfinished"]:
                raise Stop("unfinished_upload_requires_review")
            bundle.mkdir(mode=0o700)
            private_json(self.root / "status.json", result, replace=True)
            self.frozen = True  # maintenance may partially stop; finally must restore exact services.
            CURRENT_STEP = 'maintenance'
            self.trial("maintenance")
            self.no_clients()
            CURRENT_STEP = 'snapshot'
            self.before = self.snapshot()
            private_json(bundle / "database-snapshot.json", self.before)
            with open(bundle / "database.dump", "xb") as out:
                try:
                    CURRENT_STEP = 'archive'
                    execute(["docker", "exec", self.db, "pg_dump", "-w", "-U", "quote_trial", "-d", "quote_trial",
                             "--format=custom", "--no-owner"], output=out, timeout=600)
                except Stop as error:
                    raise Stop("database_dump_" + str(error)) from None
                out.flush()
                os.fsync(out.fileno())
            with open(bundle / "database.dump", "rb") as dump:
                CURRENT_STEP = 'verify_archive'
                try:
                    execute(["docker", "exec", "-i", self.db, "pg_restore", "--list"],
                            input_stream=dump, output=subprocess.DEVNULL, timeout=60)
                except Stop:
                    raise Stop("verify_failed") from None
            objects = bundle / "object-bundle"
            CURRENT_STEP = 'objects_export'
            objects.mkdir(mode=0o700)
            self.trial("objects-export", "--bundle-dir=" + str(objects))
            object_manifest = json.loads((objects / "objects.json").read_text())
            for row in object_manifest["objects"]:
                if not re.fullmatch(r"[0-9a-f-]{36}", row["id"]):
                    raise Stop("object_id_invalid")
                path = objects / "objects" / (row["id"] + ".bin")
                if path.stat().st_size != int(row["bytes"]) or digest(path) != row["sha256"]:
                    raise Stop("object_hash_mismatch")
            self.recovery_material(bundle / "recovery")
            self.no_clients()
            if self.snapshot() != self.before:
                raise Stop("database_changed_during_backup")
            result.update({"state": "BACKUP_VERIFIED", "tables": len(self.before) - 1,
                           "objects": len(object_manifest["objects"]), "fingerprint": self.p["fingerprint"]})
        except Exception as error:
            result.update({"state": "FAILED", "code": str(error) if isinstance(error, Stop) else type(error).__name__})
        finally:
            if self.frozen:
                try:
                    CURRENT_STEP = 'resume'
                    self.resume()
                    result["originalServicesResumed"] = True
                except Exception:
                    result.update({"state": "FAILED", "resumeCode": "original_services_need_attention", "originalServicesResumed": False})
            result["finishedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
            result['commandEvents'] = COMMAND_EVENTS.copy()
            # A terminal failure can still have completed cleanup. Keep this
            # separate from backup SUCCESS, and never assert cleanup after a
            # timeout/signal: Docker daemon-owned children may outlive its CLI.
            result['cleanup'] = cleanup_evidence(self.p['services'], COMMAND_EVENTS, not self.frozen)
            if bundle.exists():
                if result["state"] == "BACKUP_VERIFIED":
                    result["files"] = {str(p.relative_to(bundle)): {"bytes": p.stat().st_size, "sha256": digest(p)}
                                       for p in sorted(bundle.rglob("*")) if p.is_file()}
                    private_json(bundle / "manifest.json", result)
                    # Only complete, verified pairs are discoverable by the off-host copier.
                    private_json(self.root / "latest.json", {"id": name, "manifestSha256": digest(bundle / "manifest.json")}, replace=True)
                else:
                    private_json(bundle / "failure.json", result)
            private_json(self.root / "status.json", result, replace=True)
            lock.close()
        # File list and private recovery files never enter cron output.
        return {k: v for k, v in result.items() if k != "files"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["check", "backup", "status"])
    parser.add_argument("policy")
    args = parser.parse_args()
    policy = json.loads(direct(args.policy).read_text())
    backup = Backup(policy)
    if args.action == "check":
        backup.validate()
        print(json.dumps({"state": "EXACT_TARGET_VERIFIED", "sourceRequests": 0, "businessWrites": 0}))
    elif args.action == "status":
        value = json.loads((backup.root / "status.json").read_text())
        print(json.dumps({k: v for k, v in value.items() if k != "files"}))
    else:
        result = backup.run()
        print(json.dumps(result))
        return 0 if result["state"] == "BACKUP_VERIFIED" else 1
    return 0


if __name__ == "__main__":
    def interrupted(signum, _frame):
        raise Stop('interrupted_by_signal_' + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({"state": "FAILED", "code": str(error) if isinstance(error, Stop) else type(error).__name__}))
        sys.exit(1)
