import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
await mkdir("work", { recursive: true });
await build({
  entryPoints: ["tests/domain.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "work/domain-tests.mjs",
});
const result = spawnSync(
  process.execPath,
  ["--test", "work/domain-tests.mjs"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
