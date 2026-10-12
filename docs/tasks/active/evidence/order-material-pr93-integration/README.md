# PR92 + merged PR93 — synthetic joint regression, 2026-10-12

Original P6 / compact Order / readonly Control Tower **USER ACCEPTANCE PASS** was explicitly confirmed by the user. This is the subsequent engineering regression, not a new human acceptance.

Actual private Chromium: material closed loop **7/7, 115 assertions PASS** at 1440/1280/390; commercial UI **15/15 PASS**, including held real CCT responses released after trusted session revocation and A→B→A. No skipped tests. First run failed because the new test injection had a syntax error and the material navigation driver could inspect the previous document; both drivers were corrected without weakening production safety or test assertions, and the complete suites reran successfully.

| Page | 1440 | 1280 | 390 |
| --- | --- | --- | --- |
| P6 list | [Desktop](list-1440.png) | [Desktop](list-1280.png) | [Mobile](list-390.png) |
| Compact execution Order | [Desktop](order-1440.png) | [Desktop](order-1280.png) | [Mobile](order-390.png) |
| Readonly Control Tower | [Desktop](material-1440.png) | [Desktop](material-1280.png) | [Mobile](material-390.png) |

[Technical expansion](technical-1440.png), [mobile technical fold](order-bottom-390.png), [mobile procurement prices](material-prices-390.png), [computed styles](computed-styles.json), [prior P6 screenshot SHA comparison](p6-comparison.json). Prior images remain untouched. Commercial permission screenshots are in [commercial/](commercial/).

Desktop Foundation is loaded, toolbar flex/row at 65px, one DataTable, mobile records none; white table/card widths differ only by borders. Mobile records grid, desktop table hidden; no page overflow. Detail grids 3/1 columns, technical facts folded by default, no header/color overlap. Procurement 12.75/255 remains visible in the event table and its local mobile horizontal scroll. Actual screenshots were inspected against the old accepted evidence: original green sidebar/warm gray/white containers and compact composition retained. UUID/timestamps in expanded technical evidence may differ because PostgreSQL is disposable; no real records were queried.

The execution-only chain makes only GET reads, no CCT/Quote API requests, no Browser business storage writes, and no real Ainuoke traffic. Profiles/API/Vite/owned PostgreSQL cleanups passed. No production route/capability was activated; screenshots use synthetic sessions and data exclusively.