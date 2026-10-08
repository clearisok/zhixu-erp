import { verifyQuoteFrozenBuild } from "../server/quotes/freeze-readiness.ts";

async function main() {
  const names = ["--origin", "--commit", "--build-id", "--build-time", "--identity-mode"];
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    if (!names.includes(args[i]) || !args[i + 1] || values.has(args[i])) throw new Error("invalid_arguments");
    values.set(args[i], args[i + 1]);
  }
  if (values.size !== names.length) throw new Error("missing_arguments");
  const identityMode = values.get("--identity-mode")!;
  if (identityMode !== "session" && identityMode !== "local-single-user") throw new Error("invalid_identity_mode");
  const verified = await verifyQuoteFrozenBuild({ browserOrigin: values.get("--origin")!, gitCommit: values.get("--commit")!,
    buildId: values.get("--build-id")!, buildTime: values.get("--build-time")!, identityMode });
  console.log(JSON.stringify({ status: "PASS", ...verified, oldTabsClosure: "NOT_ATTESTED", capture: "NOT_PERFORMED", executeReady: false }));
}
main().catch(() => { console.error("Q5 frozen build verification FAILED"); process.exitCode = 1; });
