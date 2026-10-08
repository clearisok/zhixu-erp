import { constants, openSync, closeSync, fstatSync, lstatSync, readSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseAttachmentStorageConfig, type AttachmentStorageEnvironment } from "./storage-config.js";

type Values = Readonly<Record<string, string | undefined>>;
const credentialFields = ["ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID", "ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY"] as const;
const configFields = ["ZHIXU_ATTACHMENT_STORAGE", "ZHIXU_ATTACHMENT_S3_ENDPOINT", "ZHIXU_ATTACHMENT_S3_REGION",
  "ZHIXU_ATTACHMENT_S3_BUCKET", "ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE", ...credentialFields.map((field) => `${field}_FILE`)];
export class StorageConfigLoadError extends Error {
  constructor(readonly code: string, readonly field: string) { super(`${code}: ${field}`); this.name = "StorageConfigLoadError"; }
}
function fail(code: string, field: string): never { throw new StorageConfigLoadError(code, field); }

/** Bounded, regular-file-only read. Never returns raw filesystem errors/paths. */
function readText(path: string, field: string, limit: number): string {
  if (!isAbsolute(path)) fail("CONFIG_FILE_PATH_INVALID", field);
  let fd: number | undefined;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink()) fail("CONFIG_FILE_INVALID", field);
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const current = fstatSync(fd);
    if (!current.isFile() || current.ino !== before.ino || current.dev !== before.dev || current.size > limit)
      fail("CONFIG_FILE_INVALID", field);
    const data = Buffer.alloc(limit + 1);
    let size = 0, n = 0;
    while ((n = readSync(fd, data, size, data.length - size, null)) > 0) {
      size += n;
      if (size > limit) fail("CONFIG_FILE_INVALID", field);
    }
    if (size === 0) fail("CONFIG_FILE_INVALID", field);
    // All accepted config/secret content is ASCII; invalid UTF-8 cannot silently normalize.
    if (data.subarray(0, size).some((byte) => byte > 127)) fail("CONFIG_FILE_INVALID", field);
    return data.subarray(0, size).toString("ascii");
  } catch (error) {
    if (error instanceof StorageConfigLoadError) throw error;
    return fail("CONFIG_FILE_UNREADABLE", field);
  } finally { if (fd !== undefined) { try { closeSync(fd); } catch { fail("CONFIG_FILE_UNREADABLE", field); } } }
}

/** Optional non-secret KEY=value file, parsed as data, never shell sourced. Env overrides non-secret settings. */
function configuration(values: Values): Record<string, string | undefined> {
  const path = values.ZHIXU_ATTACHMENT_CONFIG_FILE;
  if (path === undefined) return { ...values };
  const text = readText(path, "ZHIXU_ATTACHMENT_CONFIG_FILE", 16_384);
  const file: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z_][A-Z0-9_]*)=(.+)$/u.exec(line);
    if (!match || !configFields.includes(match[1]) || Object.hasOwn(file, match[1]) || /[\x00-\x1f\x7f]/u.test(match[2]))
      fail("CONFIG_DATA_INVALID", "ZHIXU_ATTACHMENT_CONFIG_FILE");
    file[match[1]] = match[2];
  }
  const result: Record<string, string | undefined> = { ...file };
  for (const [key, value] of Object.entries(values)) if (value !== undefined) result[key] = value;
  return result;
}

export function loadAttachmentStorageConfiguration(environment: AttachmentStorageEnvironment, values: Values) {
  // An explicit disabled environment must not even open an optional config file.
  if (values.ZHIXU_ATTACHMENT_STORAGE?.trim() === "disabled") return { config: { kind: "disabled" } as const, sources: {} };
  const resolved = configuration(values);
  if ((resolved.ZHIXU_ATTACHMENT_STORAGE?.trim() || "disabled") === "disabled") return { config: { kind: "disabled" } as const, sources: {} };
  const sources: Record<string, "env" | "file"> = {};
  for (const field of credentialFields) {
    const pathField = `${field}_FILE`;
    if (resolved[field] !== undefined && resolved[pathField] !== undefined) fail("CREDENTIAL_SOURCE_CONFLICT", field);
    if (resolved[pathField] !== undefined) {
      const raw = readText(resolved[pathField]!, pathField, 4098);
      const value = raw.replace(/(?:\r\n|\n)$/u, "");
      if (!/^[\x21-\x7e]{1,4096}$/u.test(value)) fail("CREDENTIAL_FILE_CONTENT_INVALID", field);
      resolved[field] = value;
      sources[field] = "file";
    } else sources[field] = "env";
  }
  return { config: parseAttachmentStorageConfig(environment, resolved), sources };
}

export function loadAttachmentStorageConfig(environment: AttachmentStorageEnvironment, values: Values) {
  return loadAttachmentStorageConfiguration(environment, values).config;
}
