export type AttachmentStorageEnvironment = "development" | "test" | "production";
export type AttachmentStorageConfig = { kind: "disabled" } | {
  kind: "s3"; endpoint: string; region: string; bucket: string;
  accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean;
};

/** Pure shared parser. Errors contain field names only, never configuration values. */
export function parseAttachmentStorageConfig(environment: AttachmentStorageEnvironment,
  values: Readonly<Record<string, string | undefined>>): AttachmentStorageConfig {
  const kind = values.ZHIXU_ATTACHMENT_STORAGE?.trim() || "disabled";
  if (kind === "disabled") return { kind: "disabled" };
  if (kind !== "s3") throw new Error("ZHIXU_ATTACHMENT_STORAGE must be disabled or s3");
  const required = (name: string): string => {
    const value = values[name]?.trim();
    if (!value) throw new Error(`${name} is required for s3 attachment storage`);
    return value;
  };
  const endpoint = required("ZHIXU_ATTACHMENT_S3_ENDPOINT");
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("ZHIXU_ATTACHMENT_S3_ENDPOINT must be an absolute URL"); }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash)
    throw new Error("ZHIXU_ATTACHMENT_S3_ENDPOINT is invalid");
  if (environment === "production" && url.protocol !== "https:")
    throw new Error("ZHIXU_ATTACHMENT_S3_ENDPOINT requires HTTPS in production");
  const bucket = required("ZHIXU_ATTACHMENT_S3_BUCKET");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(bucket)) throw new Error("ZHIXU_ATTACHMENT_S3_BUCKET is invalid");
  const region = required("ZHIXU_ATTACHMENT_S3_REGION");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/u.test(region)) throw new Error("ZHIXU_ATTACHMENT_S3_REGION is invalid");
  const credentials = ["ZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID", "ZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY"].map((name) => {
    const value = required(name);
    if (!/^[\x21-\x7e]{1,4096}$/u.test(value)) throw new Error(`${name} is invalid`);
    return value;
  });
  const style = values.ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE;
  if (style !== undefined && style !== "true" && style !== "false")
    throw new Error("ZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE must be true or false");
  return { kind: "s3", endpoint: url.toString(), region, bucket, accessKeyId: credentials[0], secretAccessKey: credentials[1],
    forcePathStyle: style === "true" };
}
