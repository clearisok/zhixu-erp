export type BrowserIdentityMode = "session" | "local-single-user";

declare const __ZHIXU_BUILD_INFO__: { identityMode?: string };

export function browserIdentityMode(): BrowserIdentityMode {
  const value = typeof __ZHIXU_BUILD_INFO__ !== "undefined"
    ? __ZHIXU_BUILD_INFO__.identityMode
    : process.env.NEXT_PUBLIC_ZHIXU_IDENTITY_MODE;
  if (value === undefined || value === "" || value === "session") return "session";
  if (value === "local-single-user") return value;
  throw new Error("invalid_compiled_identity_mode");
}
