# Fixed garment contract filter observation

2026-10-23, Asia/Shanghai. This report records one expressly approved diagnostic
invocation, independent of #126/#127 integration or any runtime deployment.

## Exact tool, quota and result

- Executed clean original `feat/garment-filter-recovery` tool commit
  `0c7377d99a51bcab6589217edff69a54e7b2ee21`, after its three original checks
  were independently confirmed successful. The launcher exited0. The prior
  `chore/server-current-image-0042` branch was then restored cleanly.
- Existing local credentials were consumed only by the private process. No secret
  or raw business response is included in this report or Git.
- Exactly one invocation; exact6 HTTP attempts =2logins+4report requests. The first
  phase was D1933 first-page candidate retrieval (1login+1report). The verified
  unique C1 then drove fixed `C1 → virtual empty C0 → C1` (1login+3reports).
- Approved bounds were100rows/page,4MiB/report,16MiB report aggregate, each login
  separately limited4MiB,180seconds collecting; no retry or page2. The completed
  original launcher/validators enforced those bounds. No further read is authorized.
- Result `SCOPED_FILTER_OBSERVED`: both C1 pages contained16 rows; C0 was explicitly
  empty; complete-page, contract, witness and two-pass content validation succeeded.

## Frozen local receipt identity

The sanitized local final receipt was recorded at `2026-10-23T00:22:25.773Z`.
It binds the original safe execution receipt SHA256
`16f150cb9bf082d4e0c42c04bbe592be260a85d7392fc348d81ab94eb20eb2ab`.

| Evidence | SHA256 |
| --- | --- |
| New candidate wrapper | `982b33e53edb1090bf0e424fd2fe8ddb431f4d10a2e6cd1d5e3df7b4ded022b6` |
| Fixed query manifest | `623ab70885d0abb230e3741eaf7897fd92b0f75a80891937b202f205effb04ab` |
| C1 first response | `0c41f5285256ec7f2f810ca0ae30d2a53a30287cf7d28d0bf3fe3627a6d2fec3` |
| C0 response | `a467c0563b749e47dcf360dd3c64b643d08f04bc647dd0a228b4d95c60e95e4e` |
| C1 repeat response | `0c41f5285256ec7f2f810ca0ae30d2a53a30287cf7d28d0bf3fe3627a6d2fec3` |
| Private filter wrapper | `1802807ac39158c9e75987006e15711a6e6cb325ab5b5f0a16b9e53595ca80f3` |

148,565 retained bytes refers only to the three filter responses, not candidate,
logins or all network bytes. Private files remain in their new protected ignored
directory. The new candidate does not replace any old frozen file/hash, missing
historical asset or earlier zero-HTTP failure. Those original records remain.

## What this proves and does not prove

It proves the observed filter behavior for this account-visible unique contract
and complete first page. It does not prove all contracts, multi-page semantics,
page0 sentinel, cross-capture stable business event IDs, cancellation/reversal,
receipt of goods, financial recognition or production-source activation.

Database access was none; target/binding/activation/scheduler and business-snapshot
publication were not performed. No existing environment/account/Browser data was
changed. Num/outdate retains the already confirmed D-152 business meaning.

The existing independent reviewer checked the sanitized receipt, internal hash
association and frozen0c source, with no P1/P2. That reviewer did not open private
raw files or execute requests. The primary process enforced private file ACL/hash
checks; the review scope must not be enlarged into an independent raw-data rerun.
