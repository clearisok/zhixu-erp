# Ainuoke Order Material Progress — isolated read-only slice

2026-10-10. ENGINEERING IN PROGRESS / SYNTHETIC UI ACCEPTANCE PENDING.

## Scope and baseline

- Repository `clearisok/zhixu-erp`; dedicated worktree `D:\workspace\zhixu-order-material-b`; branch `feat/ainuoke-order-material-progress`.
- Fresh fetch origin/main `84c8c5b520dbcb956ae27a24103e6607a1c227c3`; new branch HEAD same SHA, initial status clean. Target branch/path did not exist locally/remotely. No other worktree used for implementation.
- PR #91 OPEN, head `bb451fe1895ef48eed7a8215dd1d88acd2cc0e9f`; changed files retrieved before implementation. Owner prefixes: `features/ainuoke-material-progress/`, `app/order-center/material-progress-preview/`, independently named tests and this document only. Shared state/rules/config/package/migrations/Quote/Server/ops files prohibited by the user's parallel-development instruction; this overrides routine AGENTS shared-document updates.
- Read latest context, Ainuoke API/Discovery, Style Progress, SalesOrder persistence, applicable business rules and Active D-069/D-071/D-073/D-074 plus actual source/normalization/projection/Server read code and tests.

## Audit and design boundaries

| Existing fact | Reuse / action |
| --- | --- |
| 6087050 API adapter + Normalize/Dedup/Validate Preview | Call existing pure Preview; retain Source Trace and deterministic event IDs |
| Existing pure `toAinuokeMaterialImportPreview` validator | Reuse completeness/integrity checks without calling commitImport or any repository |
| `deriveMaterialStatuses()` | Sole readiness algorithm; gate unknown/incomplete source before calling it |
| Canonical resolver and factory exclusion | Reuse D-069 group identity and `isFactorySupplied`; keep color/spec child demands |
| BillNo normalization / stable order association | Reuse formal normalized SalesContractNo; InsideOrderNo is query/drift evidence only |
| Nullable purchase fields | Missing/null evidence remains unknown; explicit numeric zero is distinct. No invalid Source can imply not_purchased |
| Unit mapping absent in MaterialDemand/6087050 | Display source quantities per demand; mark unit unverified and never total different demand/unit quantities |
| Browser persistence and formal Server material domain | Not part of this slice; no repository/Bridge/account/migration/writer integration |
| Global app bootstrap / Quote Server boundary | Independent developer preview mounts only this component on dynamic loopback port, without root providers or storage; app route also supplied but no shared route whitelist changed |

The page uses safe generated 6087050-format snapshots clearly labelled SYNTHETIC, not live sync. Pure projection indexes events/trace by demand, groups only with the existing canonical resolver, and exposes source-quality warnings. Search/filter/pagination cap rendered rows for large data. No new material identity/state/matcher/logistics algorithm.

## Planned Gates

1. Audit checkpoint and file ownership (this Gate).
2. Pure projection + synthetic fixtures + independent route/component; domain/SSR tests.
3. Isolated Chromium search/refresh/details/narrow/large-data verification, typecheck/lint/build/diff-check; final #91 intersection check; one PR only.

## Future trusted Server gap

Formal material read API/repository/storage, trusted Zhixu user to personal Ainuoke account binding, permission/visibility contract, complete snapshot lifecycle, source-version/transactional audit policy and explicit material unit semantics need a separately reviewed design. 6087050 only proves InsideOrderNo transport lookup; BillNo fieldName/compareType must not be invented. No migration number (including #91's 0010) reserved. Await #91 integration and user confirmation before formal wiring.
