import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export default async function stripMacExtendedAttributes(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = readdirSync(context.appOutDir).find((entry) => entry.endsWith(".app"));
  if (!appName) return;

  const appPath = join(context.appOutDir, appName);
  run("dot_clean", ["-m", appPath], false);
  run("xattr", ["-c", appPath], false);
  run("xattr", ["-cr", appPath], true);

  for (const attribute of [
    "com.apple.FinderInfo",
    "com.apple.ResourceFork",
    "com.apple.fileprovider.fpfs#P",
    "com.apple.provenance",
    "com.apple.quarantine"
  ]) {
    run("xattr", ["-d", attribute, appPath], false);
    run("xattr", ["-dr", attribute, appPath], false);
  }
}

function run(command, args, required) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe"
  });

  if (required && result.status !== 0) {
    throw new Error(`Failed to run ${command} ${args.join(" ")}: ${result.stderr || result.stdout}`);
  }
}
