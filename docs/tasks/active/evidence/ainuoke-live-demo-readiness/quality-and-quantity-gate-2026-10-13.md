# Quality and quantity Gate — 2026-10-13

Verified main: `064e3afaf7d08b3cb62907d4402f97d9c292f1e5`. Bounded diagnostic tooling: `29e41663389d8290fbc865db240f63c816f9c321`. No database access, real Source activation or deployment.

## Confirmed source findings

The protected original full preflight hash remains `13dc7d3b5ed3afec38bd4d8ce74fe8cba97f3ea77db4ba655df5a03a0701ba4d`. Its five demand-level classes are 12,653 known-unit/known-purchase, 2 missing-unit/known-purchase, 2 known-unit/unknown-purchase, 1,748 missing-unit/unknown-purchase, 6 conflicting-unit/unknown-purchase. Equal headline totals are not causal evidence.

A bounded read of 19 problem/sample contracts used 47 fixed report requests, complete paging and stable before/after Discovery. Six color scopes matched exact BillNo and current InsideOrderNo without drift. R0015/R0016 have two blank SizeNum rows each; R0018 has five. R0083/R0084/R0091 each have two blank color/quantity rows and one duplicated canonical source identity. These are source-field gaps/duplicates, not false-positive filtering or parser exceptions. No main order is deleted, no color or quantity is fabricated. Whether blank rows represent legitimate business placeholders requires upstream confirmation; color enrichment stays locally invalid.

Each R0172–R0177 conflict is two different source identities, the same normalized material identity/requirement/usage fields, but two distinct QtyUnit values that are not just case/trim variants. No exact duplicate caused these conflicts. Block only those six demand totals/readiness; preserve their raw facts privately and other demands normally. Do not automatically split, convert or force a unit.

R0048/R0069/R0202/R0299 again return complete empty 6087050 results. This confirms no returned material rows, not proof that no material is legally required. R0212 contains negative purchase source quantities and a negative inbound; retain unknown, do not coerce to zero or infer a reversal policy. In this targeted subset, blank/no-document and positive/with-document dominate; no malformed or positive-without-document category was observed. This is not a global all-row cause census.

Raw private evidence SHA256 `22e8af8692b07aedb9fe0690beb10883714d94531c09f08b979ac86c384c6cd9`; derived private report `253cc5796e904118d0c8ab3c3da0683cf161c2832051178d2bdf7822abd31049`; private three-line/cause review `caf2d49146988ef3bdc38cbd3398cebf38a73e7ee8495976e35eb95abbe3f546`. Owner/SYSTEM ACL checked. No private identifier/raw payload is committed here.

## Two independent quantity facts

The three user-confirmed sample identities, units and purchases match again. Source row counts 1/2/1 yield one purchase event per line. The middle two rows still represent one 356 purchase, never 712. The user-confirmed theory/purchase pairs are 115.50/118, 351.75/356 and 4.40/6. Their differences +2.50/+4.25/+1.60 are observations, not automatic conflicts/waste.

In these samples `Num*(1+Lost/100)*StyleNum` matches the confirmed theory; `Num*StyleNum` and `picnum*StyleNum` do not. TotalNum does not match the confirmed purchase for any of the three. This proves that a global replacement or relabel is unsafe. Existing requiredQuantity<-TotalNum, purchase events<-cgnum, shortfall/excess against formal requirement and deriveMaterialStatuses remain unchanged. Production consumption is still unmapped.

The read projection now adds a separate all-source-row-consistent arithmetic candidate, labeled source-calculation-unverified/observation-only. It refuses blank/invalid/negative/inconsistent inputs and common-unit comparisons when unit is missing/conflicting. It never drives readiness. Original P6 columns, layout, CSS and interactions stay intact; a paragraph in its existing expansion explains theory candidate, actual purchase and difference. V1 restores correct fact interpretation, not a redesign or full semantic approval.

## Classification

A: stable complete discovery, 552 usable/equal colors, known independent event facts and established dedup.
B: missing units/unknown quantities/candidate theory/returned empty material scopes can be displayed with explicit uncertainty.
C: six invalid color enrichments; six conflicting demand totals; negative source quantities and unresolved identity/field meaning block only dependent actions.
D: any incomplete/stale/changed discovery, scope, capacity/timeout, wrong database/image/ownership or absent real activation authorization blocks publication to that target. Real continuous demo remains unaccepted; a new owned fixture demo is a separate authorized Gate.

Tests before this checkpoint: 11 diagnostic Node, 27 diagnostic/source Python and 3 quantity-fact tests; TypeScript check passed. Browser, new Docker/PG, six-role and capacity runtime checks remain outstanding here. The original full statistics and all frozen evidence are retained.
