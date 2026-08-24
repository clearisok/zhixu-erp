import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyFormEnter } from "../components/foundation/form-enter.ts";

const base = { key: "Enter", isComposing: false, defaultPrevented: false, isTextarea: false, isSingleLineInput: true, isSubmitButton: false, modifier: false, submitOnEnter: true, insideExpandedControl: false };

test("单行输入 Enter 使用原生 form submit", () => {
  assert.equal(classifyFormEnter(base), "native-submit");
  assert.equal(classifyFormEnter({ ...base, isSingleLineInput: false, isSubmitButton: true }), "native-submit");
});

test("Textarea 普通 Enter 换行，Ctrl/Cmd+Enter 快速提交", () => {
  assert.equal(classifyFormEnter({ ...base, isTextarea: true }), "ignore");
  assert.equal(classifyFormEnter({ ...base, isTextarea: true, modifier: true }), "modifier-submit");
});

test("打开的 Select / Combobox 消费 Enter，不提交外层表单", () => {
  assert.equal(classifyFormEnter({ ...base, insideExpandedControl: true }), "ignore");
  assert.equal(classifyFormEnter({ ...base, defaultPrevented: true }), "ignore");
});

test("中文 IME composing 状态阻止 Enter 提交", () => {
  assert.equal(classifyFormEnter({ ...base, isComposing: true }), "block");
});

test("整页报价普通 Enter 被阻止，Ctrl/Cmd+Enter 保存", () => {
  assert.equal(classifyFormEnter({ ...base, submitOnEnter: false }), "block");
  assert.equal(classifyFormEnter({ ...base, submitOnEnter: false, modifier: true }), "modifier-submit");
});

test("Foundation Modal 使用 FormShell、防重复提交并自动禁用 submit 按钮", async () => {
  const modal = await readFile(new URL("../components/foundation/modal.tsx", import.meta.url), "utf8");
  const formShell = await readFile(new URL("../components/foundation/form-shell.tsx", import.meta.url), "utf8");
  const button = await readFile(new URL("../components/foundation/button.tsx", import.meta.url), "utf8");
  assert.match(modal, /onSubmit\?: \(\) => void \| Promise<void>/);
  assert.match(modal, /<FormShell/);
  assert.match(formShell, /submittingRef\.current/);
  assert.match(formShell, /if \(submittingRef\.current\) return/);
  assert.match(button, /type === "submit" && submitting/);
});

test("报价与基础设置弹窗使用 submit 语义并保留校验", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const basic = await readFile(new URL("../features/basic-settings/components/basic-settings-pages.tsx", import.meta.url), "utf8");
  const revision = await readFile(new URL("../features/quote-center/components/revision-manager-modal.tsx", import.meta.url), "utf8");
  assert.match(editor, /onSubmit=\{submitVersionModal\}/);
  assert.match(editor, /type="submit">\{creatingSecondPriceVersion/);
  assert.match(editor, /submitOnEnter=\{false\}/);
  assert.match(basic, /onSubmit=\{save\}/);
  assert.match(basic, /type="submit">保存品牌/);
  assert.match(basic, /type="submit">保存面料/);
  assert.match(revision, /onSubmit=\{mode === "update" \? submitUpdate : undefined\}/);
  assert.match(revision, /请选择更新原因/);
});

test("下拉组件在选项打开与 IME 状态下不会误提交", async () => {
  const select = await readFile(new URL("../components/foundation/searchable-select.tsx", import.meta.url), "utf8");
  const combobox = await readFile(new URL("../components/foundation/creatable-combobox.tsx", import.meta.url), "utf8");
  assert.match(select, /data-enter-scope="consume"/);
  assert.match(select, /event\.nativeEvent\.isComposing/);
  assert.match(select, /event\.key === "Enter"/);
  assert.match(combobox, /data-enter-scope="consume"/);
  assert.match(combobox, /event\.nativeEvent\.isComposing/);
  assert.match(combobox, /event\.preventDefault\(\)/);
});
