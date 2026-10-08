import { isAbsolute } from "node:path";
import { loadAttachmentStorageConfiguration, StorageConfigLoadError } from "./storage-config-loader.js";

// Built by server:build; compiled CLI has only built-in Node dependencies.
const boundary = { networkContacted: false, databaseContacted: false, runtimeDeployed: false };
try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--config" || !isAbsolute(args[1])))
    throw new StorageConfigLoadError("ARGUMENTS_INVALID", "config");
  const values: NodeJS.ProcessEnv = { ...process.env, ...(args.length ? { ZHIXU_ATTACHMENT_CONFIG_FILE: args[1] } : {}) };
  const environment = values.NODE_ENV ?? "production";
  if (environment !== "production" && environment !== "test" && environment !== "development")
    throw new StorageConfigLoadError("CONFIG_INVALID", "NODE_ENV");
  const { config, sources } = loadAttachmentStorageConfiguration(environment, values);
  const safe = config.kind === "disabled" ? { storage: "disabled", credentialSources: {} } : {
    storage: "s3", endpointIdentity: new URL(config.endpoint).origin, region: config.region, bucket: config.bucket,
    forcePathStyle: config.forcePathStyle, credentialSources: sources,
  };
  console.log(JSON.stringify({ result: "PASS", ...safe, ...boundary, credentialsValidityVerified: false, permissionsVerified: false }));
} catch (error) {
  console.error(JSON.stringify({ result: "FAIL", errorCode: error instanceof StorageConfigLoadError ? error.code : "CONFIG_INVALID",
    field: error instanceof StorageConfigLoadError ? error.field : "attachmentStorage", ...boundary }));
  process.exitCode = 1;
}
