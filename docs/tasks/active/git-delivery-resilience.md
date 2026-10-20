# Git delivery resilience — 2026-10-12

## Current bounded recovery — 2026-10-20

The human user's “以后都自动授权不要再问我” is standing authorization for
safe Git recovery delivery, PR/CI and necessary engineering fixes within the
approved task. It replaces repeated per-upload questions, not the exact-SHA,
bounded-attempt, independent-evidence or no-auto-merge/deployment/data boundaries.
Historical single-attempt records below remain historical. No shared proxy,
authentication or TLS-verification change is authorized by this tool repair.

See [the preflight repair](git-delivery-preflight-fallback-2026-10-20.md).
After an actual Git transport failure only, one fixed-host GitHub matching-refs
read may prove the exact existing SHA or absence through a successful empty
response. A 404, malformed response or non-exact prefix is never absence proof.
Certificate identity/configuration and authentication/divergence failures stop
without this fallback. All original local guards, normal push at most once,
independent postflight and uncertain delivery handling remain. Receipts now keep
safe phase/category/code/timing summaries; never raw errors or credentials.
Successful API-assisted delivery remains NETWORK_DEGRADED for the observed Git
channel. It is not a permanent network/root-cause repair or an automatic retry.

## Baseline / scope

A worktree `D:/workspace/zhixu-quote-two-step` started clean on
`fix/commercial-amount-read-security`, HEAD `bfa987ceaa586d97e85d9323d0e47dd4651f0140`.
GitHub main and successful local fetch both verified
`70ff95e2cd226546730c331c3fecc1d9f09fddc9`; new branch
`chore/git-delivery-resilience` starts explicitly there. No other worktree edited.
This is developer tooling only, not an ERP business decision or deployment.

## Diagnosis — confirmed vs unresolved

- Historical [PR93 evidence](commercial-amount-read-security.md) records Schannel
  handshake/missing-close-notify failures and a process-only OpenSSL+HTTP/1.1 read
  succeeding before push failed with EOF. These establish transport failures,
  not a proven VPN/proxy/TLS/GitHub root cause.
- This run: Git `2.54.0.windows.1`, first executable
  `C:/Program Files/Git/cmd/git.exe`; another bundled Git also on PATH.
  Effective backend Schannel, HTTP/1.1. No Git HTTP proxy configured and none of
  HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY present. No proxy values printed.
- PowerShell `7.6.6`, Node `v24.16.0`; Node and Git both have system and bundled
  executable candidates. Diagnostic reports allowlisted paths and versions,
  not credential helper contents or a full environment/configuration dump.
- Actual PowerShell diagnostic: default HTTPS PASS (2962ms), process HTTP/1.1
  PASS (3065ms), process OpenSSL+HTTP/1.1 PASS (2841ms), all returned main above.
  No configuration changed. Successful reads/fetch do not prove push stability.
- Ordinary user PowerShell comparison **NOT RUN**: use the same one-run tool
  below. No environment difference/root-cause remediation is claimed yet.
  Codex host presently has network access and no filesystem sandbox restriction;
  that is host configuration, not proof that both launch contexts share a route.
- An initial wrapper invocation could not locate `node` reliably; explicit
  `node.exe` resolution fixed the tool entry and actual wrapper now runs. This
  is not evidence about the historical TLS root cause.

## Tools and usage

Requirements: PowerShell 7.2+, Node 22.13+, Git; authenticated `gh` enables an
independent GitHub API verification channel. No automatic auth/bootstrap.

User comparison, run once in ordinary Windows PowerShell (prints safe JSON):

```powershell
& 'C:\Program Files\PowerShell\7\pwsh.exe' -NoProfile -File 'D:\workspace\zhixu-quote-two-step\scripts\git-delivery-diagnose.ps1' -Worktree 'D:\workspace\zhixu-quote-two-step'
```

Delivery (replace the complete 40-character SHA; omitted `-Execute` is Dry Run):

```powershell
pwsh -NoProfile -File 'D:\workspace\zhixu-quote-two-step\scripts\git-delivery.ps1' -Worktree 'D:\workspace\zhixu-quote-two-step' -Branch 'chore/git-delivery-resilience' -ExpectedHead '<full HEAD SHA>' -DryRun
```

For an explicit push use `-Execute` instead of `-DryRun`. The result contains a
single fully quoted recovery command when needed. Do not automatically execute
that command again from a degraded Codex channel; use it once in the user's
normal PowerShell, then inspect returned evidence. Diagnostic never pushes.

- Repo is hardcoded `clearisok/zhixu-erp`; exact trusted origin and exactly one
  identical push URL required. Allowed prefixes: feat/fix/chore/ops/codex, with
  Git ref validation. Main/master, detached/wrong branch, wrong SHA/root stop.
- All subprocesses have a 30-second bound (three read-only network contrasts,
  no retries). Windows timeout terminates only the tool-owned process tree;
  no global cleanup. Captured output capped at 16MiB, never published raw.
- Unknown dirty stops. `-ExpectedDirtyFingerprint` is an explicitly reviewed
  SHA-256 snapshot, not automatic approval: status, staged/unstaged binary diff,
  actual dirty-file bytes/mode and untracked files. It must match before and
  after; deleted files recorded, symlinks/reparse escapes and dirty files over
  16MiB safely refused. No stash/stage/reset/clean. This limit is tooling only.
- Existing remote must be provably ancestral; absent object means STOP, not
  guessed ancestry. A missing branch is accepted only after a successful exact
  `ls-remote` absent-ref result. Already exact target returns verified, no push.
- One normal exact-SHA push at most. Always post-verify with GitHub API, falling
  back to one Git read; exit zero alone never proves delivery. Authentication,
  non-fast-forward, divergence or changed local evidence stop. Error strings,
  credentials and proxy values never appear in public result.
- Exact remote: DELIVERED_VERIFIED. Read unavailable:
  LOCAL_PASS_REMOTE_UNVERIFIED / REMOTE_UNVERIFIED. Verified old/absent remote:
  LOCAL_PASS_REMOTE_NOT_DELIVERED. Neither pending state is code/test failure.
  Retry always false. TLS error even when delivered enters NETWORK_DEGRADED
  for subsequent gates; independent local work may continue.
- Module dependency injection exists for isolated tests only; CLI has no fake
  remote/auth bypass or fault-injection switch. SSH443 was not needed or tested;
  no authentication/remote switching was performed. Any future SSH fallback
  requires separately approved identity/authentication setup.

## Verification / recovery point

Initial directed Node run 21/21 PASS (state tests + isolated real Git/bare repos).
Normal push, lost response after delivery, no delivery, unavailable remote,
zero-exit/unverified, auth denial, divergence, inherited dirty preservation,
wrong targets, duplicate avoidance, API verification, timeout and secret
redaction covered. Actual PowerShell parsing, diagnostic wrapper and main-ref
rejection PASS. Final regression/checkpoint/remote outcome recorded below when
completed. ERP/Chromium/DB/build tests NOT RUN: no affected business inputs.

Gate1/2 final tool code: **25/25 PASS**, no skips; targeted ESLint with
`--max-warnings 0`, Node syntax, both PowerShell parses and diff-check PASS.
Intermediate regression detected short Windows temp paths vs canonical long
paths in two dirty tests; canonical-root comparison fixed it, targeted2/2 then
complete25/25 passed. No weakening of content/hash or path escape checks.
Certificate trust/expiry and unsupported backend explicitly STOP, never treated
as recoverable transport. Tool checkpoint and remote status are recorded in
the final delivery below; not inferred from successful read-only diagnostics.

No business data, other worktree, global credentials/TLS/proxy, migration,
18443/18444, Docker or COS operated. No automatic merge. Main task history and
old TLS evidence retained, not rewritten as current network failure.

## Gate3/4 delivery

- Tool checkpoint `ffc7b142cdfd521c1e46123d55dd00ec6b71609c`: actual PowerShell
  `-Execute`, normal push once (6202ms), independent GitHub API exact SHA,
  DELIVERED_VERIFIED / networkMode NORMAL / no repeated push.
- AGENTS now requires important local checkpoints, NETWORK_DEGRADED stops
  subsequent same-channel pushes, independent local work can continue. Remote
  dependent steps wait; never forge original commit delivery with file APIs.
  This is workflow policy only, not BUSINESS_RULES/DECISION_LOG.
- Final documentation commit/remote SHA/unique PR recorded in GitHub and final
  report; no self-SHA documentation commit loop. Final code unchanged after
  complete25/25 run; final documentation does not reuse ERP test counts.
- Main path: guarded normal HTTPS single push + independent API verification.
  Backup path: same guarded tool once in ordinary Windows PowerShell. No global
  backend switch, credential change or SSH conversion. Root cause **UNRESOLVED**;
  observed successful push/read is evidence of this attempt, not a permanent fix.
