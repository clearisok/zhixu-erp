import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("normal server startup verifies migrations without invoking the apply runner", async () => {
  const source = await repositoryFile("server/index.ts");
  assert.doesNotMatch(source, /\brunMigrations\b/);
  assert.match(source, /verifyMigrationsCurrent/);
  assert.match(source, /initializeServer/);
});

test("migration application remains an explicit package command", async () => {
  const packageJson = JSON.parse(await repositoryFile("package.json"));
  const migrateSource = await repositoryFile("server/db/migrate.ts");
  assert.equal(packageJson.scripts["db:migrate"], "tsx server/db/migrate.ts");
  assert.equal(packageJson.scripts["db:migrate:status"], "tsx server/db/migration-status.ts");
  assert.match(migrateSource, /runMigrations/);
});
