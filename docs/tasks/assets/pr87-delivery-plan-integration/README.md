# PR #87 synthetic DeliveryPlan API evidence

Executed 2026-10-09/10 in the dedicated order worktree with `npm run demo:delivery-plans`.
[JSONL evidence](demo.jsonl) contains 14 checked state snapshots plus PASS and cleanup records. All orders/users are synthetic. Source creation/refresh uses existing internal services; human writes and displayed snapshots use authenticated session PATCH/GET on a dynamic loopback API. Session cookies and credentials are never printed or retained.

The six business steps show default 100, permanent human ownership, source 120 with short 20, split 40+60, second row 80 for matched 120, then source 90 with excess 30. Signed difference is planned total minus source quantity; NUMERIC arithmetic and decimal strings preserve exact values. Extra snapshots cover no initial date/no later default, generated zero/manual zero HTTP400, exact 0.000000000000000001, null date/restored original ID and competing stale PATCH statuses 200/409.

The driver reuses `startDisposablePostgres()` (PostgreSQL 16, random container, tmpfs, dynamic loopback port), closes API/pool, removes only its own container and checks its exact name is absent. This run used API port 49688 and container `zhixu-pg-it-eeb5e1c590d1`; final cleanup PASS. No real configuration, secrets, business DB, win01 ports or deployment was accessed.
