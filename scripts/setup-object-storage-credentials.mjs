import { constants, closeSync, openSync, writeSync, mkdirSync, lstatSync, chmodSync, chownSync,
  writeFileSync, linkSync, unlinkSync, rmdirSync, mkdtempSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { ReadStream } from "node:tty";
import { pathToFileURL } from "node:url";

export async function installCredentials({ directory, uid, gid, endpoint, region, bucket, forcePathStyle }, readHidden) {
  if (process.platform !== "linux" || !isAbsolute(directory) || !Number.isSafeInteger(uid) || uid < 0 ||
      !Number.isSafeInteger(gid) || gid < 0 || /[\s\x00-\x1f]/u.test(directory)) throw new Error("SETUP_ARGUMENTS_INVALID");
  directory = resolve(directory);
  if (directory === "/" || directory === "/etc" || directory === "/tmp") throw new Error("SETUP_DIRECTORY_INVALID");
  const createdDirs = [], published = [];
  let stage;
  const ensure = (path) => {
    if (dirname(path) !== path) ensure(dirname(path)); // reject symlink ancestors as well as leaf targets
    try { if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw new Error("SETUP_TARGET_INVALID"); }
    catch (error) {
      if (error.code !== "ENOENT") throw new Error("SETUP_TARGET_INVALID");
      ensure(dirname(path)); mkdirSync(path, { mode: 0o700 }); createdDirs.push(path);
      chownSync(path, uid, gid); chmodSync(path, 0o700);
    }
  };
  try {
    ensure(directory);
    const secrets = join(directory, "secrets", "cos");
    ensure(secrets);
    for (const path of [directory, join(directory, "secrets"), secrets]) {
      const s = lstatSync(path);
      if (s.uid !== uid || (s.mode & 0o077) !== 0) throw new Error("SETUP_DIRECTORY_PERMISSIONS_INVALID");
    }
    const names = [join(secrets, "secret-id"), join(secrets, "secret-key"), join(directory, "cos.env")];
    for (const path of names) {
      try { lstatSync(path); throw new Error("SETUP_TARGET_EXISTS"); }
      catch (error) { if (error.code !== "ENOENT") throw new Error("SETUP_TARGET_EXISTS"); }
    }
    // No config publication until both secrets exist. Exclusive links never overwrite a racing target.
    stage = mkdtempSync(join(directory, ".cos-setup-")); chmodSync(stage, 0o700);
    const id = await readHidden("COS SecretId: ");
    const key = await readHidden("COS SecretKey: ");
    if (![id, key].every((value) => /^[\x21-\x7e]{1,4096}$/u.test(value))) throw new Error("SETUP_CREDENTIAL_INVALID");
    const { parseAttachmentStorageConfig } = await import("../dist/server/server/attachments/storage-config.js");
    const values = { ZHIXU_ATTACHMENT_STORAGE: "s3", ZHIXU_ATTACHMENT_S3_ENDPOINT: endpoint,
      ZHIXU_ATTACHMENT_S3_REGION: region, ZHIXU_ATTACHMENT_S3_BUCKET: bucket,
      ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE: forcePathStyle,
      ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID: id, ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY: key };
    const config = parseAttachmentStorageConfig("production", values);
    if (config.kind !== "s3") throw new Error("SETUP_CONFIG_INVALID");
    values.ZHIXU_ATTACHMENT_S3_ENDPOINT = config.endpoint;
    values.ZHIXU_ATTACHMENT_S3_REGION = config.region;
    values.ZHIXU_ATTACHMENT_S3_BUCKET = config.bucket;
    delete values.ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID; delete values.ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY;
    values.ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID_FILE = names[0];
    values.ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY_FILE = names[1];
    const contents = [id + "\n", key + "\n", Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n") + "\n"];
    for (let i = 0; i < names.length; i++) {
      const temporary = join(stage, String(i));
      writeFileSync(temporary, contents[i], { mode: 0o600, flag: "wx" });
      chownSync(temporary, uid, gid); chmodSync(temporary, 0o600);
      linkSync(temporary, names[i]); published.push({ path: names[i], inode: lstatSync(temporary).ino });
    }
    return { result: "PASS", configFile: names[2], uid, gid, mode: "0600", networkContacted: false, runtimeDeployed: false };
  } catch {
    for (const item of published.reverse()) {
      try { if (lstatSync(item.path).ino === item.inode) unlinkSync(item.path); } catch { /* never unlink somebody else's target */ }
    }
    throw new Error("SETUP_FAILED");
  } finally {
    if (stage) {
      for (let i = 0; i < 3; i++) { try { unlinkSync(join(stage, String(i))); } catch { /* own stage only */ } }
      try { rmdirSync(stage); } catch { /* no recursive deletion */ }
    }
    // On failure, remove only empty directories created by this attempt.
    if (published.length !== 3) for (const path of createdDirs.reverse()) { try { rmdirSync(path); } catch { /* preserve existing data */ } }
  }
}

async function main() {
  let fd, tty;
  try {
    const args = process.argv.slice(2), options = {};
    const allowed = ["directory", "uid", "gid", "endpoint", "region", "bucket", "force-path-style"];
    for (let i = 0; i < args.length; i += 2) {
      const field = args[i]?.replace(/^--/u, "");
      if (!args[i]?.startsWith("--") || !allowed.includes(field) || !args[i + 1] || Object.hasOwn(options, field))
        throw new Error("SETUP_ARGUMENTS_INVALID");
      options[field] = args[i + 1];
    }
    if (allowed.some((field) => !Object.hasOwn(options, field)) || !/^\d+$/u.test(options.uid) || !/^\d+$/u.test(options.gid))
      throw new Error("SETUP_ARGUMENTS_INVALID");
    fd = openSync("/dev/tty", constants.O_RDWR);
    tty = new ReadStream(fd, { autoClose: false });
    tty.setRawMode(true);
    const readHidden = (prompt) => new Promise((resolveInput, reject) => {
      let value = "";
      writeSync(fd, prompt);
      const signal = () => end(new Error("SETUP_CANCELLED"));
      const end = (error) => {
        tty.off("data", data); process.off("SIGTERM", signal); tty.pause(); writeSync(fd, "\n");
        if (error) reject(error); else resolveInput(value);
      };
      const data = (chunk) => {
        for (const byte of chunk) {
          if (byte === 3 || byte === 4) return end(new Error("SETUP_CANCELLED"));
          if (byte === 10 || byte === 13) return end();
          if (byte === 8 || byte === 127) value = value.slice(0, -1);
          else if (byte < 33 || byte > 126 || value.length >= 4096) return end(new Error("SETUP_INPUT_INVALID"));
          else value += String.fromCharCode(byte);
        }
      };
      process.once("SIGTERM", signal); tty.on("data", data); tty.resume();
    });
    const report = await installCredentials({ ...options, uid: Number(options.uid), gid: Number(options.gid),
      forcePathStyle: options["force-path-style"] }, readHidden);
    console.log(JSON.stringify(report));
  } catch {
    console.error(JSON.stringify({ result: "FAIL", errorCode: "SETUP_FAILED", networkContacted: false, runtimeDeployed: false }));
    process.exitCode = 1;
  } finally {
    if (tty) { try { tty.setRawMode(false); tty.destroy(); } catch { process.exitCode = 1; } }
    if (fd !== undefined) { try { closeSync(fd); } catch { /* already closed */ } }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
