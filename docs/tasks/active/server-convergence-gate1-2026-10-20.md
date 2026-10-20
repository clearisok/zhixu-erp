# Server convergence Gate 1 — persistent empty local target

2026-10-20. Main baseline `996dfedc12da3527343cd3ff2aa5eea35497e10e`.
Branch `codex/server-persistent-empty-target` in the existing clean `7bf3` worktree,
created from main then fast-forwarded to the explicit Gate 0 dependency
`652fed6464b5aea144689480c936a0c5f2d62d90`. No inherited dirty changes.
Gate 0 draft PR #124 has all three CI checks successful at that exact head;
it is not merged. The approved continuous Goal is now active.

## Scope and implementation boundary

- New local persistent empty target only. No historical migration/import needed.
- Preserve 3001, 50426, 59069, 62326, historical environments, accounts and volumes.
  No cutover, source collection, real account changes, formal deployment or merge.
- Reuse `ops/quote-trial` production/session/PostgreSQL/S3 and existing backup format.
  Local objects is opt-in, exact five services with internal-only network, digest-pinned
  object image, owned named volumes, private keys and process-specific certificate trust.
- Normal startup stays schema verify-only. Explicit initialization is new-empty-only.
  No new backend, attachment owner, database restore implementation or global TLS bypass.
- Shared restore writer guard is unchanged: only database can run during DB restore.
  Object restore follows in its distinct local object store, app/gateway still stopped.
- Final persistent target must be empty before user use; synthetic writing/recovery
  occurs only in two new test projects. No testing then clearing the final target.

## Review and checks to date

Independent pre-review confirmed strict three/five-service separation, actual volume
checks, signed HeadBucket, DB-only restore freeze and distinct target object ownership
are required. These requirements are in the implementation and negative tests.

Initial targeted operational regression: 36 passed (configuration, actual TLS probe,
runtime/readiness, Windows private input/control and Linux secret volumes). No actual
persistent target or recovery test has passed yet. First targeted lint found one unused
test variable; it was removed before the next check. Full actual-image rehearsal,
final quality/baseline, independent code review and exact remote delivery remain pending.

The actual main application behavior is unchanged in this Gate. #120–#123 integration
remains Gate 2. New Server closing CNY/USD is a future domain target, not a change to
current Quote currencies or a claim that closing exists.
