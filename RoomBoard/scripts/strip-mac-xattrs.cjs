const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

exports.default = async function stripMacExtendedAttributes(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = readdirSync(context.appOutDir).find((entry) => entry.endsWith(".app"));
  if (!appName) return;

  const appPath = join(context.appOutDir, appName);
  run("dot_clean", ["-m", appPath], false);
  run("xattr", ["-cr", appPath], false);

  for (const attribute of [
    "com.apple.FinderInfo",
    "com.apple.ResourceFork",
    "com.apple.fileprovider.fpfs#P",
    "com.apple.provenance",
    "com.apple.quarantine"
  ]) {
    run("xattr", ["-rd", attribute, appPath], false);
    run("find", [appPath, "-exec", "xattr", "-d", attribute, "{}", ";"], false);
  }

  console.log(`Stripped macOS extended attributes from ${appPath}`);
};

function run(command, args, required) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: required ? "pipe" : "ignore"
  });

  if (required && result.status !== 0) {
    throw new Error(`Failed to run ${command} ${args.join(" ")}: ${result.stderr || result.stdout}`);
  }
}
