import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("侧栏溢出菜单通过 Portal 脱离侧栏滚动容器", async () => {
  const source = await read("components/foundation/sidebar-floating-menu.tsx");
  assert.match(source, /createPortal\(/);
  assert.match(source, /document\.body/);
  assert.match(source, /data-sidebar-floating-menu="true"/);
  assert.match(source, /getBoundingClientRect\(\)/);
});

test("浮层处理视口碰撞、滚动、resize、点击外部和 Esc", async () => {
  const source = await read("components/foundation/sidebar-floating-menu.tsx");
  assert.match(source, /canFitRight/);
  assert.match(source, /canFitLeft/);
  assert.match(source, /window\.innerWidth/);
  assert.match(source, /window\.innerHeight/);
  assert.match(source, /addEventListener\("resize", updatePosition\)/);
  assert.match(source, /addEventListener\("scroll", updatePosition, true\)/);
  assert.match(source, /addEventListener\("pointerdown", closeOnOutside\)/);
  assert.match(source, /event\.key !== "Escape"/);
});

test("AppShell Wide/Primary 使用内联子菜单，Compact 使用浮层，Touch 使用统一 Drawer", async () => {
  const source = await read("components/foundation/app-shell.tsx");
  assert.match(source, /SidebarFloatingMenu/);
  assert.match(source, /expandedSidebar = viewportMode === "wide" \|\| viewportMode === "primary"/);
  assert.match(source, /compactSidebar = viewportMode === "compact"/);
  assert.match(source, /open=\{systemOpen && compactSidebar\}/);
  assert.match(source, /open=\{basicOpen && compactSidebar\}/);
  assert.match(source, /<Drawer open=\{navigationOpen && touchNavigation\}/);
  assert.doesNotMatch(source, /className="ops-nav-flyout"/);
});

test("浮层保持 ERP 紧凑尺寸且不制造页面宽度", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.ops-sidebar-popover\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.ops-sidebar-popover\s*\{[^}]*z-index:\s*320/s);
  assert.match(css, /\.ops-sidebar-popover\s*\{[^}]*width:\s*min\(204px,\s*calc\(100vw - 16px\)\)/s);
  assert.match(css, /\.ops-sidebar-popover\s*\{[^}]*max-height:\s*calc\(100dvh - 16px\)/s);
  assert.match(css, /\.ops-sidebar-popover button\s*\{[^}]*min-height:\s*38px/s);
  assert.match(css, /\.ops-sidebar-popover button:hover/);
  assert.match(css, /\.ops-sidebar-popover button\.active/);
}
);
