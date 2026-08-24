import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorUrl = new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url);
const navigationUrl = new URL("../features/quote-center/components/quote-quick-navigation.tsx", import.meta.url);
const cssUrl = new URL("../app/quote-center/quote-center.css", import.meta.url);

test("R15-R16 导航项目与页面真实可见区域一致", async () => {
  const editor = await readFile(editorUrl, "utf8");
  assert.match(editor, /revision\.priceVersions\.length >= 2 \? \[\{ id: "quote-section-price-versions", label: "价格版本" \}\] : \[\]/);
  for (const [id, label] of [
    ["quote-section-base-info", "基本信息"],
    ["quote-section-fabrics", "面料"],
    ["quote-section-trims", "辅料"],
    ["quote-section-labor", "加工费"],
    ["quote-section-other-costs", "其他费用"],
    ["quote-section-attachments", "附件"],
  ]) {
    assert.match(editor, new RegExp(`id: "${id}", label: "${label}"`));
    assert.match(editor, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(editor.slice(editor.indexOf("const quickNavigationItems"), editor.indexOf("const headerActions")), /外协/);
});

test("R17-R23 快速导航与操作区共用同一 sticky 触发并保留滚动边距", async () => {
  const editor = await readFile(editorUrl, "utf8");
  const navigation = await readFile(navigationUrl, "utf8");
  const css = await readFile(cssUrl, "utf8");
  assert.match(navigation, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(navigation, /<nav[^>]+aria-label="报价详情快速导航"/);
  assert.match(navigation, /<button[^>]+type="button"/);
  assert.match(css, /\.qc-quick-navigation \{ position: relative;/);
  assert.doesNotMatch(css, /\.qc-quick-navigation \{ position: sticky;/);
  assert.match(editor, /qc-sticky-header[\s\S]*<QuoteQuickNavigation items=\{quickNavigationItems\}/);
  assert.match(css, /\.qc-page-section-anchor \{ scroll-margin-top: 188px; \}/);
  assert.ok(css.indexOf(".qc-quick-navigation") < css.indexOf(".qc-page-section-anchor"));
});

test("R24 窄屏折叠为可访问的快速导航菜单", async () => {
  const navigation = await readFile(navigationUrl, "utf8");
  const css = await readFile(cssUrl, "utf8");
  assert.match(navigation, /aria-haspopup="menu"/);
  assert.match(navigation, /aria-expanded=\{open\}/);
  assert.match(navigation, /role="menu"/);
  assert.match(navigation, /role="menuitem"/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.qc-quick-navigation-desktop \{ display: none; \}/);
  assert.match(css, /\.qc-quick-navigation-mobile \{ position: relative;[^}]*display: flex;/);
});
