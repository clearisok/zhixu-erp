import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "../../../../components/foundation/data-table";
import { PermissionProvider } from "../../../permissions/components/permission-provider";

const columns = [{ key: "identity", header: "Identity", minWidth: 180, width: 220, render: (row: { id: string }) => row.id }, { key: "action", header: "Action", width: 120, render: () => "Open" }];
const preference = { moduleKey: "synthetic", tableKey: "test", columnOrder: ["identity", "action"], columnWidths: { identity: 56, action: 120 } };
function render(layout?: "fit" | "readable" | "fixed") {
  return renderToStaticMarkup(<PermissionProvider><DataTable rows={[{ id: "synthetic" }]} columns={columns} rowKey={row => row.id} tablePreference={preference} layout={layout} /></PermissionProvider>);
}
test("shared Browser/basic-settings default remains percentage fit-first without pixel table floor", () => {
  const html = render();
  assert.match(html, /data-layout="fit"/);
  assert.match(html, /width:[\d.]+%/);
  assert.doesNotMatch(html, /min-width:/);
});
test("explicit Server readable layout enforces actual pixel floors despite narrower saved preference", () => {
  const html = render("readable");
  assert.match(html, /data-layout="readable"/);
  assert.match(html, /min-width:300px/);
  assert.match(html, /data-column-key="identity" style="width:180px/);
  assert.equal(preference.columnWidths.identity, 56, "Existing preference is not silently rewritten");
});
test("fixed pixel layout opts out of container surplus distribution without changing defaults", () => {
  const html = render("fixed");
  assert.match(html, /data-layout="fixed"/);
  assert.match(html, /width:300px;min-width:300px;max-width:300px/);
  assert.match(html, /data-column-key="identity" style="width:180px/);
});
