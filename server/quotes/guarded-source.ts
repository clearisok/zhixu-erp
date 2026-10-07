import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/u;

/** Q5-specific reviewed source surface. Broad script scope is intentionally conservative. */
export const Q5_CRITICAL_PATHS = [
  "server/quotes/", "server/db/", "features/data-management/", "features/quote-center/",
  "features/runtime/build-info.ts", "server/build-identity.ts", "app/quote-center/",
  "features/order-center/components/quote-to-order-modal.tsx",
  "database/migrations/", "scripts/", "package.json", "package-lock.json",
  "Dockerfile.server", "server/config.ts", "server/index.ts", "vite.config.ts",
] as const;

export class QuoteSourceGuardError extends Error {
  constructor(readonly code: string) { super(code); this.name = "QuoteSourceGuardError"; }
}

async function git(root: string, args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const result = await run("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
    return { code: 0, stdout: result.stdout.trim() };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    return { code: typeof failure.code === "number" ? failure.code : 128, stdout: failure.stdout?.trim() ?? "" };
  }
}

/** Read-only Git guard. No fetch, checkout, reset, index update, or network call. */
export async function assertReviewedQuoteSource(root: string, reviewedCommit: string): Promise<{ head: string; reviewedCommit: string }> {
  if (!SHA.test(reviewedCommit)) throw new QuoteSourceGuardError("invalid_reviewed_commit");
  const head = await git(root, ["rev-parse", "HEAD"]);
  if (head.code !== 0 || !SHA.test(head.stdout)) throw new QuoteSourceGuardError("head_unavailable");
  if ((await git(root, ["merge-base", "--is-ancestor", reviewedCommit, head.stdout])).code !== 0)
    throw new QuoteSourceGuardError("reviewed_commit_not_ancestor");
  const paths = ["--", ...Q5_CRITICAL_PATHS];
  if ((await git(root, ["diff", "--quiet", reviewedCommit, head.stdout, ...paths])).code !== 0)
    throw new QuoteSourceGuardError("reviewed_critical_source_drift");
  if ((await git(root, ["diff", "--quiet", ...paths])).code !== 0)
    throw new QuoteSourceGuardError("critical_worktree_dirty");
  if ((await git(root, ["diff", "--cached", "--quiet", ...paths])).code !== 0)
    throw new QuoteSourceGuardError("critical_index_dirty");
  for (const [args, code] of [
    [["ls-files", "--others", "--exclude-standard", ...paths], "untracked_critical_source"],
    [["ls-files", "--others", "--ignored", "--exclude-standard", ...paths], "ignored_critical_source"],
  ] as const) {
    const result = await git(root, [...args]);
    if (result.code !== 0 || result.stdout) throw new QuoteSourceGuardError(code);
  }
  return { head: head.stdout, reviewedCommit };
}
