# Expanded sidebar labels — Gate 3 V1 correction

2026-10-30 (Asia/Shanghai). Comparison main is `b1b24186a300b330f29a2950e507711555c35b6c`; branch `fix/server-expanded-sidebar-labels`. This is a restoration within the approved Gate 3 navigation scope, not a new menu, density, breakpoint or business workflow.

## Verified defect and cause

After the explicitly approved isolated staging update to main b1, the actual authenticated Chromium page at 1135×884 showed a 186px expanded sidebar with icons but no navigation labels, brand details, organization text or sidebar identity details. A read-only DOM inspection confirmed `data-responsive-mode="primary"`, `data-sidebar-state="expanded"`, button and label font size **0px**, and label width **0px**. The labels remained in the accessibility tree; checking only text presence or shell continuity did not detect this visual failure.

`components/foundation/responsive.ts` selects primary mode at 1100–1439px. The older `app/globals.css` max-width 1180px rule independently hid sidebar content and set navigation font size to zero. Foundation restored the expanded width but did not reverse every old declaration. Thus the overlapping 1100–1180px range mixed expanded geometry with icon-only styling.

## Minimal correction

Scope only the old max-width 1180px **sidebar** fallback to shells without `data-responsive-mode`. Foundation-controlled shells then use their existing base/primary/compact/tablet/mobile and explicit collapsed-state rules. Keep the old fallback for genuine legacy shells. Keep the same metric/schedule/user grid media rules, 600/1100/1440 mode boundaries, menu items, permissions, routes and component state.

Only `app/globals.css` changes product behavior. The existing production-built Server navigation test gains geometry/font/display assertions at 1100,1135,1180,1181,1280,1440 and1920px, settings submenu visibility at1135px, explicit collapse/reexpand, and the1099↔1135 compact transition. It restores1440px before the pre-existing routing cases. Existing mobile/permission/session/history/unknown-result tests remain intact.

## Validation and delivery state

At this checkpoint the new correction and browser assertions are written; no new tests or build are yet claimed. Required next checks: real Server build with locked existing dependencies, actual Chromium navigation suite, type/lint checks appropriate to the change, exact release guard and required baseline regression, then independent review and one concentrated PR delivery. No dependency install, real Source request, account reset, database migration, merge or staging update is authorized by this correction itself.

Before evidence is the actual main-b1 browser observation above; the private screenshot and deployment receipts remain under ignored `outputs/pr135-approved-staging-update/`. New synthetic screenshots will use distinct output paths. No old approved screenshot/hash is replaced and no new screenshot is represented as human accepted.

## Current deployment and broader Goal

The separately approved b1 deployment is complete: fresh paired database/object backup, independent PostgreSQL16.15 recovery with121 tables/sequences equal before boot,33 restored and33 public API readbacks, original3 SO/2 users/1 Quote/attachment preserved. Public browser quote/order pages show b1. All business tables, original identities/passwords/role bindings, DB/MinIO containers and prior assets are retained; recovery stopped with volumes retained. Authentication-only timestamp/counter changes were checked explicitly. No Source collection, scheduler or CI rerun occurred in that update. Final independent review found noP1/P2.

The original finite Source snapshots are stale; histories remain available. No prices, production, bank-paid or closing facts were fabricated. Full G1–G5/Gate0–8/R remains open for current human business acceptance, final-entry choice and separately approved retirement. Original3001,50426 and all protected local/remote assets remain. PR136 is a separate unmerged tooling draft; this product correction does not depend on merging it.
