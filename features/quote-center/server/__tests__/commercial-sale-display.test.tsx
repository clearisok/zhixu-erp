import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuoteCockpit } from "../../components/quote-metrics.tsx";
import { PriceVersionSelector } from "../../components/price-version-selector.tsx";
import { createQuoteDraft } from "../../model/quote-view-model.ts";

test("cockpit and PV cards remove the selling amount, not authorized cost or Browser defaults", () => {
  const revision = createQuoteDraft("synthetic-sale-display", "QT-SYNTHETIC", "2026-10-11").revisions[0];
  const version = revision.priceVersions[0];
  version.labor.value = 123;
  version.fabrics = []; version.trims = []; version.otherCosts = [];
  version.pricingParameters.markupRate = 10;
  const cockpit = (canViewSale?: boolean) => renderToStaticMarkup(<QuoteCockpit version={version} canViewSale={canViewSale} revisionLabel="V1" priceVersionLabel="Synthetic" productionLabel="Synthetic" confirmationLabel="未确认" differenceCount={0} settingsAction={null} />);
  const cards = (canViewSale?: boolean) => renderToStaticMarkup(<PriceVersionSelector revision={revision} activeId={version.id} readOnly canViewSale={canViewSale} onSelect={() => {}} onEdit={() => {}} />);
  for (const render of [cockpit, cards]) {
    assert.match(render(true), /¥135\.3/u);
    assert.equal(render(), render(true), "default Browser consumers retain presentation");
    assert.match(render(false), /无权查看/u);
    assert.doesNotMatch(render(false), /135\.3(?!\d)/u, "no selling value or hidden attribute; distinct authorized ¥135.30 labor cost remains");
  }
  assert.match(cockpit(false), /¥123\.00/u, "internal cost retains its independent semantics");
});
