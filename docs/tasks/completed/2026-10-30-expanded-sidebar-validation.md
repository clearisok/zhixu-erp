# Expanded sidebar — corrected local acceptance

2026-10-30 (Asia/Shanghai). Baseline main is `b1b24186a300b330f29a2950e507711555c35b6c`; branch `fix/server-expanded-sidebar-labels`. This records local engineering only. Staging remains b1; no merge, deployment or new Source access occurred.

## Result and exact scope

At1135px the deployed b1 sidebar was186px wide but its navigation text was0px, caused by the legacy1180px media rule overlapping Foundation primary mode from1100px. The correction scopes only the legacy sidebar fallback to shells without a responsive-mode attribute. `:where(...)` preserves the original selector weights so later legacy coarse-touch rules still win. Existing menus,600/1100/1440 breakpoints, explicit collapse, permissions, routes, mobile interaction, non-sidebar media rules and business owners are unchanged. Only `app/globals.css` changes product behavior.

Product/build source is `6954fdf57e8c0e40cb783c70ca0c92aea35b2606`; final browser test source is `6d3073480d6646bbc048992636d15f162bb3a893`. The intervening commits change only the navigation test. The test runner verifies that exact file-only difference before reusing the actual production build; it does not rebuild or relabel its build identity.

## Executed validation

- Fresh archive build with existing locked dependencies: PASS. Server Quote/master settings, session identity, writable Quote and snapshot order authority; build ID `sidebar-6954fdf5-46da3bcd`. No dependency install or live runtime replacement.
- Actual Chromium production-navigation suite: **20/20 PASS**, no failures, cancellation or skips. Seven expanded widths1100/1135/1180/1181/1280/1440/1920 retain186px width and11px labels;1135 settings submenu is visible; collapse78px, reexpand and1099 compact transition pass. Original delayed/error/history/dirty/receipt/session cases remain.
- Legacy synthetic probe:1135 desktop keeps its existing icon-only fallback;390 coarse-touch has7px navigation text,52px buttons,62px bottom bar, hidden organization/user/brand. Probe-only transitions are disabled to measure settled CSS; actual product transitions remain unchanged. Probe is removed and emulation restored before routing tests.
- TypeScript, final test syntax and targeted ESLint: PASS.
- Required release-baseline/responsive regression: **182/182 PASS**, no failures/cancellation/skips, duration1,080,142ms. Frozen manifest had603 evidence records. The subsequent final evidence binding is checked by the exact source/evidence guard; it does not justify rerunning unchanged product tests.
- Independent read-only review of product/test diff and actual build/browser observations: no remaining P1/P2.1135px synthetic screenshot also visually inspected. No approved historical screenshot or hash replaced.

Private local receipts retain build/test hashes under `outputs/server-sidebar-candidate-v2.json`, `outputs/server-sidebar-local-engineering-final.json`, and the fresh candidate directory `D:/zhixu-server-convergence/candidates/expanded-sidebar-6954fdf5-46da3bcd`. They contain no new Source collection. Source requests0; existing accounts and business databases untouched.

## Honest intermediate outcomes

Initial b141 build/browser checks passed but independent review found the ancestor-specificity P2. Its baseline attempt was deliberately stopped (20 completed tests and one terminated test-file failure); it is retained as incomplete, not PASS. The corrected6954 browser attempt failed because its probe measured before resize committed. The4922 test waited for resize but measured the button's0.16-second CSS transition before completion. Final6d30 changes only the owned synthetic probe's transition and viewport synchronization;20/20 then pass. All earlier logs and checkpoints remain; no GitHub CI was spent on these local attempts.

## Delivery and whole-Goal boundary

Next: exact final guard, clean final commit, one safe upload, independently verify remote SHA, create one draft PR, then inspect its one necessary automatic CI round. CI/PR success is not merge or deployment permission. Existing #136 is a separate tooling draft and is not a product dependency.

The approved b1 isolated Ningbo deployment, paired backup/recovery,33 restored/33 public readbacks and preserved3 SO/2 users/Quote/attachment are unchanged. Original finite Source snapshots remain stale with histories available; no prices, production, payment or closing facts are fabricated. Full G1–G5/Gate0–8/R remains open for human business acceptance, final entry and separately approved asset retirement.3001,50426 and all prior databases, volumes, backups and worktrees stay protected.
