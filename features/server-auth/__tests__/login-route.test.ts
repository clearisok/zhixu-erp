import assert from "node:assert/strict";
import test from "node:test";
import { safeLoginReturnTo, loginHref } from "../login-route";

test("login preserves an internal deep link, query and hash", () => {
  const target = "/quote-center/detail?id=synthetic%2F1&name=%E7%BB%87#cost";
  assert.equal(safeLoginReturnTo(target), target);
  assert.equal(new URL(loginHref(target), "https://zhixu.invalid").searchParams.get("returnTo"), target);
});
for (const target of [null, "", "https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/%2f%2fevil.invalid", "/%5cevil.invalid", "/%252f%252fevil.invalid", "/%00evil", "/a\n/b", "/a\t/b", "/%ZZ", "/login", "/LOGIN?returnTo=/login", "/%6cogin/", "/a/../login", "/api/v1/auth/logout", "/assets/script", "/build-info.json", "/"+"a".repeat(2048)]) {
  test("login rejects unsafe/loop/non-page return target " + JSON.stringify(target)?.slice(0, 80), () => assert.equal(safeLoginReturnTo(target), "/quote-center"));
}
test("future internal order routes preserve targets without enabling capabilities", () => assert.equal(safeLoginReturnTo("/order-center/style-progress?id=synthetic"), "/order-center/style-progress?id=synthetic"));
