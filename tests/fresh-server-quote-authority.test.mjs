import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("fresh formal routes keep explicit default Browser branch and no candidate redirect", () => {
  const pages = source("features/quote-center/components/production-quote-pages.tsx");
  for (const browser of ["QuoteList", "QuoteNewLoader", "QuoteDetailLoader"]) assert.match(pages, new RegExp(`: <${browser} />`, "u"));
  assert.match(pages, /quoteAuthority\(\) === "server"/u);
  assert.doesNotMatch(pages, /router\.(push|replace)\("\/quote-center\/server-/u);
});

test("Server entry isolates Browser bootstrap, permissions, preferences and unsupported business modules", () => {
  assert.match(source("features/data-management/components/local-data-bootstrap.tsx"), /quoteAuthority\(\) === "server"/u);
  const boundary = source("features/quote-center/components/quote-server-boundary.tsx");
  assert.match(boundary, /return <PermissionProvider>\{children\}/u);
  assert.match(boundary, /<TrustedPermissionProvider>/u);
  assert.match(boundary, /!isEnabledServerRoute\(path\)/u);
  const shell = source("components/foundation/app-shell.tsx");
  assert.match(shell, /if \(freshServer\) return;/u);
  assert.match(shell, /!freshServer\) saveSidebarPreference/u);
  assert.match(source("components/foundation/data-table.tsx"), /quoteAuthority\(\) !== "server"\) saveTablePreference/u);
});
