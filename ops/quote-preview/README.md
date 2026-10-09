# D-099 local user Preview

Status: **USER ACCEPTANCE PENDING**. This environment stays running; no automatic cleanup.

- Open `D:\zhixu-local-preview\d099-18444\Open-Preview.cmd`. It uses a dedicated Chrome profile and only this Preview certificate's pinned SPKI. It changes no system trust store, default Chrome profile or Server authentication policy.
- Address: https://localhost:18444/quote-center. For a normal browser, the new self-signed certificate may produce a warning. The dedicated launcher avoids that warning without installing a CA.
- Open `D:\zhixu-local-preview\d099-18444\Show-DemoAccount.cmd` to view the generated synthetic account in local Notepad. Credentials/config/cert keys stay in the private runtime directory, never Git/chat.
- Search `DEMO` for the 12 prepared processing/distribution Quotes. Automated UI checks also leave their synthetic new drafts in place; nothing is silently deleted. Open a DEMO row, edit style/cost fields, use **保存草稿** / sticky **保存**, and refresh to check persistence. Use 更多 → 列表页面设置 to toggle/reorder fields and test horizontal scroll. New Quote lets you explicitly select processing or distribution before creating.

## Isolation and immutable candidate

Project `zhixu-preview-d099-18444`; runtime `D:\zhixu-local-preview\d099-18444`. New database `quote_preview`, user `quote_preview`, volume `${project}_data`; object bucket `preview-attachments` in private MinIO volume `${project}_objects`. Separate app-secrets/tls/object-certs volumes. Default network is internal; dedicated front network exposes only gateway **127.0.0.1:18444**. App/DB/objects have no host ports. Compose app/gateway/object TLS proxy use the exact approved image ID, not a mutable tag.

Image `zhixu-quote-trial-d099:20261009T103901Z`, ID `sha256:e28a4aec22e59567858ce3e99775646c68d30f90ffa1df95fdf5fbcbb5792c0d`, source `330aad7d1bfc8e93326e1eb4971a7a9f34a74514`, build `d099-win01-20261009T103901Z` / `2026-10-09T10:39:01Z`. Production/server/server/writable/session. All eight released migration byte hashes checked against the preparation evidence before explicit initialization of this new empty Preview DB. Rejected 103523Z image never used. Real win01/ledger were not accessed. TLS is a new 30-day Preview-only certificate; no global trust mutation.

## Tools and limitations

`setup.mjs` is deliberately new-root-only and checks context/project/volumes/port/image/build/migrations before creation. `verify-and-seed.mjs` rechecks live ownership, ports/images/mounts, trusted TLS, auth/Origin/RBAC, seed/readback and Preview S3 attachment bytes. A populated Preview is never reset/reseeded. `browser-verify.mjs` uses a new headless profile and this certificate's pin, clicks actual Server UI, creates both types, edits/saves/reloads, changes personal field settings and scrolls the table. Each run deliberately leaves its synthetic drafts and profile. Private credentials are never printed.

No cleanup/reset/down-with-volumes command is provided. Preserve user feedback and Preview data; resource retirement requires a separate decision. Initial anonymous MinIO /certs volume was caught by the ownership guard before seeding; replaced by an explicit owned volume. The old unused anonymous volume remains preserved, not automatically removed.

List thumbnail/country/PV-name summary, copy/delete Quote, delete historical Revision, Quote-to-Order and complete Order/Scheduling/Closing remain unsupported. Candidate artifacts are fixed at PR86 merge, not rebuilt from current main. Preview is for synthetic acceptance, not production or win01 deployment.
