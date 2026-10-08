import { mkdir, open, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { preflightObjectStorage } from "../server/attachments/object-storage-preflight.js";

async function main() {
  const args = process.argv.slice(2);
  let file: FileHandle | undefined;
  let failureCode = "ARGUMENTS_INVALID";
  try {
    if (args.length !== 0 && (args.length !== 2 || args[0] !== "--evidence" || !isAbsolute(args[1])))
      throw new Error("invalid_arguments");
    if (args.length) {
      failureCode = "EVIDENCE_CREATE_FAILED";
      await mkdir(dirname(args[1]), { recursive: true });
      file = await open(args[1], "wx", 0o600); // reserve before any provider operation; never overwrite
    }
    const environment = process.env.NODE_ENV ?? "production";
    if (!["production", "test", "development"].includes(environment)) {
      failureCode = "CONFIG_INVALID"; throw new Error("invalid_environment");
    }
    const evidence = await preflightObjectStorage(process.env, { environment: environment as "production" | "test" | "development" });
    const json = `${JSON.stringify(evidence, null, 2)}\n`;
    failureCode = "EVIDENCE_WRITE_FAILED";
    if (file) { await file.writeFile(json, "utf8"); await file.sync(); }
    process.stdout.write(json);
    if (evidence.result !== "PASS") process.exitCode = 1;
  } catch {
    process.stderr.write(`${JSON.stringify({ result: "FAIL", errorCode: failureCode })}\n`);
    process.exitCode = 1;
  } finally { try { await file?.close(); } catch { process.exitCode = 1; } }
}
void main();
