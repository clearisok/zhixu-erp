import assert from "node:assert/strict";
import test from "node:test";
import { browserIdentityMode } from "../identity-mode";

test("Browser identity mode defaults to session and requires an explicit local build flag", () => {
  const previous = process.env.NEXT_PUBLIC_ZHIXU_IDENTITY_MODE;
  try {
    delete process.env.NEXT_PUBLIC_ZHIXU_IDENTITY_MODE;
    assert.equal(browserIdentityMode(), "session");
    process.env.NEXT_PUBLIC_ZHIXU_IDENTITY_MODE = "local-single-user";
    assert.equal(browserIdentityMode(), "local-single-user");
    process.env.NEXT_PUBLIC_ZHIXU_IDENTITY_MODE = "invalid";
    assert.throws(() => browserIdentityMode(), /invalid_compiled_identity_mode/u);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ZHIXU_IDENTITY_MODE;
    else process.env.NEXT_PUBLIC_ZHIXU_IDENTITY_MODE = previous;
  }
});
