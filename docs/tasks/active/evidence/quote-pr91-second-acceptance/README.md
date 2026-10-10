# PR91 second user acceptance — synthetic Chromium evidence

2026-10-10. Source **eb9530ac9a2e1b7f68299d97c4d424662a6622f7**. Full Server Chromium **78/78** and separate list/image **27/27** actually ran this source's Server frontend. All data, users, objects and profiles belong to disposable test harnesses; no user screenshots, real Quote data, credentials or Preview captures are included.

Before references: user-supplied screenshots remain outside Git; earlier synthetic [settings/detail evidence](../quote-direct-creation/) is retained as the previous layout, not rerun/current source.

## Representative after images

- [Factory manager, Windows125% equivalent](settings-1536.png) / [creation defaults below it](settings-defaults-1536.png).
- [Default list, Windows125% equivalent](list-default-1536.png).
- [Detail first screen at1280](detail-1280.png) / [localized failed master-read retry](detail-local-read-error.png).
- [Current-PV scheme cards](pricing-scheme-desktop.png) / [touch390 modal](pricing-390.png).
- [Related authorized image](../quote-pr91-second-list/related-image.png).

## Resolution index

Desktop is fine-pointer, browser100%; **1536×864 CSS/DPR1.25** represents1920×1080 Windows125% display scaling. Other desktop captures use CSS1920/1440/1280/900 ×864.390×844 is true touch/coarse-pointer emulation. No page-level horizontal overflow at any tested size;900 table uses its own horizontal scroll.

| CSS width | Factory manager | Defaults | Detail | PV scheme modal | Default list |
| --- | --- | --- | --- | --- | --- |
|1920|[image](settings-1920.png)|[image](settings-defaults-1920.png)|[image](detail-1920.png)|[image](pricing-1920.png)|[image](list-default-1920.png)|
|1536/DPR1.25|[image](settings-1536.png)|[image](settings-defaults-1536.png)|[image](detail-1536.png)|[image](pricing-1536.png)|[image](list-default-1536.png)|
|1440|[image](settings-1440.png)|[image](settings-defaults-1440.png)|[image](detail-1440.png)|[image](pricing-1440.png)|[image](list-default-1440.png)|
|1280|[image](settings-1280.png)|[image](settings-defaults-1280.png)|[image](detail-1280.png)|[image](pricing-1280.png)|[image](list-default-1280.png)|
|900|[image](settings-900.png)|[image](settings-defaults-900.png)|[image](detail-900.png)|[image](pricing-900.png)|[image](list-default-900.png)|
|390/touch|[image](settings-390.png)|[image](settings-defaults-390.png)|[image](detail-390.png)|[image](pricing-390.png)|touch records covered by image/list harness|

## Actual pixels, not screenshot inference

[Layout measurements](layout-metrics.json): table/container widths1530/1530 at1920,1264/1264 at1536/DPR1.25,1172/1172 at1440,1019/1019 at1280. At900, table978/container764: local scrolling, document900.

[Resize measurements](../quote-pr91-second-list/pixels.json): original/independent-field views ×1920/1440/1280/900; dragged brand+40px, every other column unchanged (allowed1px rounding). Additional real DOM checks: saved100px header/cell, refresh/reopen/view switch; oldv1/user isolation; keyboard resize/order; explicit reset restores auto fill; numeric limits reject rather than silently clamp. Corresponding images:

| Width | Original grouped | Independent fields |
| --- | --- | --- |
|1920|[image](../quote-pr91-second-list/original-1920.png)|[image](../quote-pr91-second-list/fields-1920.png)|
|1440|[image](../quote-pr91-second-list/original-1440.png)|[image](../quote-pr91-second-list/fields-1440.png)|
|1280|[image](../quote-pr91-second-list/original-1280.png)|[image](../quote-pr91-second-list/fields-1280.png)|
|900|[image](../quote-pr91-second-list/original-900.png)|[image](../quote-pr91-second-list/fields-900.png)|

40 PNGs and two measurement JSONs. Full business/permission/409/receipt/snapshot/file SHA regression and candidate status are in the [task record](../../quote-two-step-creation.md#second-user-acceptance-revision-2026-10-10). **USER ACCEPTANCE PENDING; these images do not prove18444 has been updated.**
