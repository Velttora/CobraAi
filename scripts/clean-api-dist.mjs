import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = join(root, "apps", "api");

for (const target of [
  join(apiRoot, "dist"),
  join(apiRoot, "tsconfig.build.tsbuildinfo")
]) {
  rmSync(target, { force: true, recursive: true });
}
