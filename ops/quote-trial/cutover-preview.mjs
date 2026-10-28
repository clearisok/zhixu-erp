// Read-only preparation for the approved 50426 target. No execute mode, config
// writer, Docker run/start/stop, credentials, database or Source access exists here.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, opendirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_SERVICES, LOCAL_VOLUMES } from './local-objects.mjs';
import { allocateTrialSubnets } from './subnet-policy.mjs';

const fullSha = /^[a-f0-9]{40}$/u;
const imageSha = /^sha256:[a-f0-9]{64}$/u;
const requestKeys = ['project', 'root', 'opsRoot', 'sourceSha', 'imageId', 'buildId', 'buildTime'];
const digest = value => createHash('sha256').update(value).digest('hex');
class PreviewError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new PreviewError(code); };
const check = (condition, code) => { if (!condition) fail(code); };
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const within = (parent, child) => {
  const value = relative(parent, child);
  return value === '' || value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
};

export function createReadOnlyRunner(environment = process.env, execute = execFileSync) {
  return (file, argv, { timeout = 10000 } = {}) => {
    check(Number.isInteger(timeout) && timeout > 0 && timeout <= 10000, 'bounded_command_timeout_required');
    if (file === 'docker') check(!['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'].some(key => environment[key]), 'docker_environment_override_not_supported');
    const env = { ...environment, GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
    // -C must identify the explicit repository, not an inherited Git override.
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[key];
    return execute(file, argv, { encoding: 'utf8', env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 4 * 1024 * 1024 });
  };
}

export function validateCutoverRequest(input, verifiedMain) {
  check(input && typeof input === 'object' && !Array.isArray(input), 'invalid_request');
  check(Object.keys(input).sort().join(',') === [...requestKeys].sort().join(','), 'unexpected_request_fields');
  for (const key of requestKeys) check(typeof input[key] === 'string' && input[key].length > 0 && input[key].length <= 1024 && !/[\x00-\x1f]/u.test(input[key]), 'invalid_request_value');
  check(/^zhixu-quote-trial-main-[a-f0-9]{10}$/u.test(input.project), 'new_main_project_required');
  check(fullSha.test(input.sourceSha) && fullSha.test(verifiedMain), 'full_commit_required');
  check(imageSha.test(input.imageId), 'content_image_id_required');
  check(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/u.test(input.buildId), 'invalid_build_id');
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(input.buildTime) && Number.isFinite(Date.parse(input.buildTime)), 'invalid_build_time');
  for (const key of ['root', 'opsRoot']) check(isAbsolute(input[key]) && !input[key].startsWith('\\\\') && !input[key].startsWith('//'), 'local_absolute_path_required');
  const root = resolve(input.root), opsRoot = resolve(input.opsRoot);
  check(dirname(root) !== root && !within(root, opsRoot) && !within(opsRoot, root), 'separate_new_root_required');
  return { ...input, root, opsRoot };
}

// Facts must come from the live collector below. An exported pure model makes
// failure/partial-observation cases testable without touching an existing target.
export function buildCutoverPreview(input, verifiedMain, facts, now = new Date()) {
  const request = validateCutoverRequest(input, verifiedMain);
  check(facts.complete === true && facts.image && Array.isArray(facts.containers) && Array.isArray(facts.volumes) && Array.isArray(facts.networks) && Array.isArray(facts.listeners) && Array.isArray(facts.hostRoutes) && Array.isArray(facts.opsFiles) && facts.opsFiles.length > 0, 'complete_observation_required');
  check(facts.containers.every(row => typeof row.name === 'string' && typeof row.running === 'boolean' && Array.isArray(row.ports) && row.ports.every(port => Number.isInteger(Number(port.hostPort)) && Number(port.hostPort) > 0 && Number(port.hostPort) <= 65535)), 'invalid_container_port_observation');
  check(facts.volumes.every(row => typeof row.name === 'string') && facts.networks.every(row => typeof row.name === 'string' && Array.isArray(row.subnets)), 'invalid_resource_observation');
  check(facts.listeners.every(row => row.port === 50426 && typeof row.address === 'string'), 'invalid_listener_observation');
  check(facts.opsFiles.every(row => typeof row.path === 'string' && /^[a-f0-9]{64}$/u.test(row.sha256)), 'invalid_ops_observation');
  const blockers = [];
  const requireFact = (condition, code) => { if (!condition) blockers.push(code); };
  requireFact(request.sourceSha === verifiedMain, 'image_source_is_not_verified_main');
  requireFact(facts.newRoot === true, 'target_directory_exists_or_indirect');
  requireFact(facts.opsExact === true, 'immutable_ops_mismatch');
  const labels = facts.image.labels ?? {};
  requireFact(facts.image.id === request.imageId && labels['org.opencontainers.image.revision'] === request.sourceSha && labels['io.zhixu.build-id'] === request.buildId && labels['org.opencontainers.image.created'] === request.buildTime && labels['io.zhixu.identity-mode'] === 'session' && labels['io.zhixu.quote-authority'] === 'server' && labels['io.zhixu.master-settings-authority'] === 'server' && labels['io.zhixu.quote-writer-mode'] === 'writable', 'image_identity_mismatch');
  requireFact(facts.listeners.length === 0 && !facts.containers.some(row => row.running && row.ports.some(port => Number(port.hostPort) === 50426)), 'target_port_occupied');
  requireFact(!facts.containers.some(row => row.project === request.project || row.name === request.project || row.name.startsWith(`${request.project}-`)), 'target_project_exists');
  requireFact(!facts.volumes.some(row => row.project === request.project || row.name.startsWith(`${request.project}_`)), 'target_volume_exists');
  requireFact(!facts.networks.some(row => row.project === request.project || row.name.startsWith(`${request.project}_`)), 'target_network_exists');
  let subnets = [];
  try { subnets = allocateTrialSubnets([...facts.hostRoutes, ...facts.networks.flatMap(row => row.subnets).filter(value => !value.includes(':'))], 2); }
  catch { blockers.push('network_ranges_unverified_or_unavailable'); }
  const plan = {
    contract: 'zhixu-50426-cutover-preview.v1', observedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 600000).toISOString(),
    mode: 'PREVIEW_ONLY', status: blockers.length ? 'BLOCKED' : 'READY_FOR_REVIEW', executionAuthorized: false,
    request, verifiedMain, mainProof: 'caller_supplied_observation_not_remote_verification',
    target: { port: 50426, origin: 'https://localhost:50426', binding: '127.0.0.1', services: [...LOCAL_SERVICES], volumes: LOCAL_VOLUMES.map(key => `${request.project}_${key}`), networks: ['default', 'ingress'].map((key, index) => ({ name: `${request.project}_${key}`, subnet: subnets[index] ?? null, internal: key === 'default' })), importHistoricalData: false, sourceActivation: false },
    blockers, observationSha256: digest(JSON.stringify(facts)), observations: facts, opsFiles: facts.opsFiles,
    protection: { existingContainers: facts.containers.length, existingVolumes: facts.volumes.length, existingNetworks: facts.networks.length, stoppedPortOwners: facts.containers.filter(row => !row.running && row.ports.some(port => Number(port.hostPort) === 50426)).map(row => row.name), stopOrDelete: false, browserStoresChanged: false, sharedSettingsChanged: false },
    requiredBeforeExecution: ['fresh_main_and_explicit_merge_verification', 'compiled_image_and_compose_checks_with_existing_trial_tool', 'fresh_directory_port_project_and_network_observations', 'explicit_approval_for_exact_target_and_maintenance_window', 'separate_guarded_execution_implementation'],
    notices: ['HTTPS is a different origin from the old HTTP entry.', 'Same-host session cookies are shared across ports; never clear user browser stores.', 'A preview hash is evidence identity, not authorization or a reservation.', 'Failure must preserve existing and partially prepared assets.'],
    runtimeWrites: 0,
  };
  return { ...plan, previewSha256: digest(JSON.stringify(plan)) };
}

function existsDirect(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function directPath(path) {
  for (let current = path; ; current = dirname(current)) {
    const info = existsDirect(current);
    if (info && (info.isSymbolicLink() || !info.isDirectory() || !samePath(realpathSync(current), current))) return false;
    if (dirname(current) === current) return true;
  }
}
function outsideCheckout(path) {
  for (let current = path; ; current = dirname(current)) {
    if (existsDirect(join(current, '.git'))) return false;
    if (dirname(current) === current) return true;
  }
}
function walkFiles(root, deadline) {
  const files = []; let entries = 0;
  const visit = (prefix, depth) => {
    deadline(); check(depth <= 8, 'ops_depth_budget_exceeded');
    const directory = opendirSync(join(root, prefix));
    try {
      for (let item = directory.readSync(); item; item = directory.readSync()) {
        deadline(); check(++entries <= 256, 'ops_entry_budget_exceeded');
        const path = join(prefix, item.name);
        check(!item.isSymbolicLink(), 'indirect_ops_file');
        if (item.isDirectory()) visit(path, depth + 1);
        else { check(item.isFile(), 'unsupported_ops_entry'); files.push(path.replaceAll('\\', '/')); }
        check(files.length <= 128, 'ops_file_budget_exceeded');
      }
    } finally { directory.closeSync(); }
  };
  visit('', 0); return files.sort();
}

export function collectCutoverFacts(request, repository, run, readHost, clock = () => Date.now()) {
  const started = clock();
  const deadline = () => check(clock() - started < 120000, 'observation_deadline');
  const remainingTimeout = () => { const remaining = 120000 - (clock() - started); check(remaining > 0, 'observation_deadline'); return Math.min(10000, remaining); };
  const command = (file, args) => {
    const timeout = remainingTimeout();
    try { return run(file, args, { timeout }); }
    catch (error) { if (error instanceof PreviewError) throw error; fail(file === 'git' ? 'git_evidence_read_failed' : `docker_${args[0] === '--host' ? args[2] : args[0]}_read_failed`); }
  };
  const context = command('docker', ['context', 'show']).trim();
  check(context === 'desktop-linux', 'desktop_linux_context_required');
  const endpoint = JSON.parse(command('docker', ['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}']));
  check(endpoint === 'npipe:////./pipe/dockerDesktopLinuxEngine', 'local_docker_pipe_required');
  // Pin the endpoint itself so a concurrent context edit cannot redirect queries.
  const docker = args => command('docker', ['--host', endpoint, ...args]);
  const daemon = JSON.parse(docker(['info', '--format', '{"id":{{json .ID}},"osType":{{json .OSType}},"operatingSystem":{{json .OperatingSystem}},"name":{{json .Name}}}']));
  check(typeof daemon.id === 'string' && daemon.id.length > 0 && daemon.osType === 'linux' && daemon.operatingSystem === 'Docker Desktop' && daemon.name === 'docker-desktop', 'local_linux_daemon_required');
  const git = args => command('git', ['--no-optional-locks', '-C', repository, ...args]);
  const list = value => value.trim().split(/\r?\n/u).filter(Boolean);
  const ids = list(docker(['ps', '-a', '-q', '--no-trunc']));
  check(ids.length <= 2048 && ids.every(id => /^[a-f0-9]{64}$/u.test(id)), 'container_inventory_invalid');
  const containers = [];
  for (let offset = 0; offset < ids.length; offset += 20) {
    const format = '{"name":{{json .Name}},"running":{{json .State.Running}},"project":{{with .Config.Labels}}{{json (index . "com.docker.compose.project")}}{{else}}null{{end}},"ports":{{json .HostConfig.PortBindings}},"publishedPorts":{{json .NetworkSettings.Ports}}}';
    const rows = list(docker(['inspect', '--format', format, ...ids.slice(offset, offset + 20)])).map(value => JSON.parse(value));
    check(rows.length === ids.slice(offset, offset + 20).length, 'container_inventory_incomplete');
    const portRows = values => Object.entries(values ?? {}).flatMap(([containerPort, ports]) => (ports ?? []).map(port => ({ containerPort, hostPort: port.HostPort, hostIp: port.HostIp })));
    for (const row of rows) {
      const configuredPorts = portRows(row.ports), publishedPorts = portRows(row.publishedPorts);
      const automaticPortBindings = configuredPorts.filter(port => port.hostPort === '');
      check(!row.running || automaticPortBindings.every(port => publishedPorts.some(published => published.containerPort === port.containerPort && (!port.hostIp || published.hostIp === port.hostIp))), 'running_port_assignment_unavailable');
      containers.push({ name: row.name.replace(/^\//u, ''), running: row.running, project: row.project, configuredPorts, publishedPorts, automaticPortBindings,
        ports: [...configuredPorts.filter(port => port.hostPort !== ''), ...publishedPorts] });
    }
  }
  const named = (kind, format) => {
    const names = list(docker([kind, 'ls', '-q']));
    check(names.length <= 4096 && names.every(name => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,255}$/u.test(name)), 'resource_inventory_invalid');
    const rows = [];
    for (let offset = 0; offset < names.length; offset += 20) rows.push(...list(docker([kind, 'inspect', '--format', format, ...names.slice(offset, offset + 20)])).map(value => JSON.parse(value)));
    check(rows.length === names.length, 'resource_inventory_incomplete');
    return rows;
  };
  const volumes = named('volume', '{"name":{{json .Name}},"project":{{with .Labels}}{{json (index . "com.docker.compose.project")}}{{else}}null{{end}}}');
  const networks = named('network', '{"name":{{json .Name}},"project":{{with .Labels}}{{json (index . "com.docker.compose.project")}}{{else}}null{{end}},"ipam":{{json .IPAM.Config}}}').map(row => ({ name: row.name, project: row.project, subnets: (row.ipam ?? []).map(config => config.Subnet).filter(Boolean) }));
  const image = JSON.parse(docker(['image', 'inspect', '--format', '{"id":{{json .Id}},"labels":{{json .Config.Labels}}}', request.imageId]));
  // Select only identity labels; arbitrary image metadata is never printed.
  image.labels = Object.fromEntries(['org.opencontainers.image.revision', 'io.zhixu.build-id', 'org.opencontainers.image.created', 'io.zhixu.identity-mode', 'io.zhixu.quote-authority', 'io.zhixu.master-settings-authority', 'io.zhixu.quote-writer-mode'].map(key => [key, image.labels?.[key] ?? null]));
  const paths = list(git(['ls-tree', '-r', '--name-only', request.sourceSha, '--', 'ops/quote-trial/']));
  check(paths.length > 0 && paths.length <= 128 && paths.every(path => /^ops\/quote-trial\/[a-zA-Z0-9_./-]+$/u.test(path) && !path.includes('..')), 'ops_manifest_invalid');
  let sourceBytes = 0;
  const opsFiles = paths.map(path => { const content = git(['show', `${request.sourceSha}:${path}`]); sourceBytes += Buffer.byteLength(content); check(sourceBytes <= 8 * 1024 * 1024, 'ops_total_bytes_exceeded'); return { path: path.slice('ops/quote-trial/'.length), sha256: digest(content) }; });
  const opsDirect = directPath(request.opsRoot) && outsideCheckout(request.opsRoot);
  let opsExact = opsDirect && JSON.stringify(walkFiles(request.opsRoot, deadline)) === JSON.stringify(opsFiles.map(row => row.path).sort());
  let diskBytes = 0;
  if (opsExact) opsExact = opsFiles.every(row => { deadline(); const file = join(request.opsRoot, row.path); const bytes = lstatSync(file).size; diskBytes += bytes; check(bytes <= 4 * 1024 * 1024 && diskBytes <= 8 * 1024 * 1024, 'ops_file_budget_exceeded'); return digest(readFileSync(file)) === row.sha256; });
  deadline();
  let host;
  try { host = readHost(remainingTimeout()); } catch (error) { if (error instanceof PreviewError) throw error; fail('host_observation_failed'); }
  check(Array.isArray(host.listeners) && host.listeners.every(row => row.port === 50426) && Array.isArray(host.routes) && host.routes.length > 0, 'host_observation_invalid');
  deadline();
  return { complete: true, dockerContext: context, dockerEndpoint: endpoint, dockerDaemon: daemon, newRoot: !existsDirect(request.root) && directPath(dirname(request.root)) && outsideCheckout(dirname(request.root)), opsExact, opsFiles, image, containers, volumes, networks, listeners: host.listeners, hostRoutes: host.routes };
}

export function runCutoverCli(args, { platform = process.platform, run = createReadOnlyRunner(), now = () => new Date() } = {}) {
  check(args.length === 3 && args.every(value => !value.startsWith('--')), 'usage_request_file_verified_main_repository');
  check(platform === 'win32', 'windows_local_target_required');
  const [file, verifiedMain, repository] = args;
  check(isAbsolute(file) && isAbsolute(repository) && lstatSync(file).isFile() && lstatSync(file).size <= 16384, 'bounded_absolute_request_required');
  const request = validateCutoverRequest(JSON.parse(readFileSync(file, 'utf8')), verifiedMain);
  const hostScript = "$ErrorActionPreference='Stop'; $listeners=@(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 50426 | ForEach-Object { @{address=$_.LocalAddress;port=[int]$_.LocalPort} }); $routes=@(Get-NetRoute -AddressFamily IPv4 | ForEach-Object DestinationPrefix); @{listeners=$listeners;routes=$routes} | ConvertTo-Json -Depth 4 -Compress";
  const facts = collectCutoverFacts(request, repository, run, timeout => JSON.parse(run('pwsh', ['-NoProfile', '-NonInteractive', '-Command', hostScript], { timeout })));
  return buildCutoverPreview(request, verifiedMain, facts, now());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runCutoverCli(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'BLOCKED' ? 2 : 0;
  } catch (error) {
    // External command errors may contain paths or private stderr; never echo them.
    console.log(JSON.stringify({ mode: 'PREVIEW_ONLY', status: 'OBSERVATION_FAILED', failureCode: error instanceof PreviewError ? error.code : 'invalid_observation_or_input', executionAuthorized: false, runtimeWrites: 0 }));
    process.exitCode = 1;
  }
}
