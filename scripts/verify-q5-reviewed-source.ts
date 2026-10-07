import { resolve } from "node:path";
import { assertReviewedQuoteSource, QuoteSourceGuardError } from "../server/quotes/guarded-source.js";

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--repo" || args[2] !== "--reviewed-commit") {
  process.stderr.write('{"error":"invalid_reviewed_source_arguments"}\n');
  process.exitCode = 2;
} else {
  try {
    const result = await assertReviewedQuoteSource(resolve(args[1]), args[3]);
    process.stdout.write(`${JSON.stringify({ result: "PASS", ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error instanceof QuoteSourceGuardError ? error.code : "reviewed_source_unavailable" })}\n`);
    process.exitCode = 2;
  }
}
