import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);
const IMAGE = "bitnamilegacy/minio:2025.7.23-debian-12-r5";

async function docker(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("docker", args, { encoding: "utf8", timeout: 120_000, windowsHide: true });
    return stdout.trim();
  } catch { throw new Error("Disposable MinIO Docker operation failed"); }
}

export async function startDisposableMinio() {
  const suffix = randomBytes(6).toString("hex");
  const containerName = `zhixu-minio-it-${suffix}`;
  const accessKeyId = `test${suffix}`;
  const secretAccessKey = randomBytes(24).toString("hex");
  const bucket = `zhixu-attachments-test-${suffix}`;
  let started = false;
  try {
    await docker(["run", "--rm", "--detach", "--name", containerName,
      "--env", `MINIO_ROOT_USER=${accessKeyId}`, "--env", `MINIO_ROOT_PASSWORD=${secretAccessKey}`,
      "--tmpfs", "/bitnami/minio/data", "--publish", "127.0.0.1::9000", IMAGE]);
    started = true;
    const port = (await docker(["port", containerName, "9000/tcp"])).match(/:(\d+)$/u)?.[1];
    if (!port) throw new Error("Disposable MinIO port unavailable");
    const endpoint = `http://127.0.0.1:${port}`;
    const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey }, maxAttempts: 1 });
    const deadline = Date.now() + 90_000;
    while (true) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        break;
      } catch {
        if (Date.now() >= deadline) throw new Error("Disposable MinIO did not become ready");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    return { containerName, endpoint, region: "us-east-1", bucket, accessKeyId, secretAccessKey,
      async stop() { client.destroy(); await docker(["rm", "--force", containerName]); } };
  } catch (error) {
    if (started) await docker(["rm", "--force", containerName]).catch(() => undefined);
    throw error;
  }
}
