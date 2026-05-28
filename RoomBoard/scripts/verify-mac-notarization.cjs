#!/usr/bin/env node

const { existsSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const targetPath = resolve(process.argv[2] || findDefaultAppPath());
if (!targetPath || !existsSync(targetPath)) {
  console.error("Usage: node scripts/verify-mac-notarization.cjs path/to/RoomBoard.app-or.dmg");
  process.exit(1);
}

if (targetPath.endsWith(".app")) {
  verifyApp(targetPath);
} else if (targetPath.endsWith(".dmg") || targetPath.endsWith(".zip")) {
  verifyArtifact(targetPath);
} else {
  console.error(`Unsupported target type: ${targetPath}`);
  process.exit(1);
}

console.log(`Mac distribution checks passed for ${targetPath}`);

function findDefaultAppPath() {
  const candidates = [
    join("dist", "mac-arm64"),
    join("dist", "mac"),
    join("dist-capture-mac", "mac-arm64"),
    join("dist-capture-mac", "mac")
  ];

  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const appName = readdirSync(dir).find((entry) => entry.endsWith(".app"));
    if (appName) return join(dir, appName);
  }
  return "";
}

function verifyApp(appPath) {
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  run("codesign", ["-dv", "--verbose=4", appPath]);
  run("spctl", ["--assess", "--verbose=4", "--type", "execute", appPath]);
  run("xcrun", ["stapler", "validate", appPath]);
  assertNoBlockedExtendedAttributes(appPath);

  const helperPath = join(appPath, "Contents", "Resources", "capture-helper-mac", "RoomBoardCaptureHelper");
  if (existsSync(helperPath)) {
    run("codesign", ["--verify", "--strict", "--verbose=2", helperPath]);
  }
}

function verifyArtifact(artifactPath) {
  const assessment = run("spctl", ["--assess", "--verbose=4", "--type", "open", artifactPath], { required: false });
  if (assessment.status !== 0) {
    const output = `${assessment.stderr || ""}\n${assessment.stdout || ""}`;
    if (!output.includes("source=Insufficient Context")) {
      throw new Error(`Failed to run spctl --assess --verbose=4 --type open ${artifactPath}\n${assessment.stderr || assessment.stdout}`);
    }
    console.warn(`Skipping non-fatal Gatekeeper open assessment for ${artifactPath}: Insufficient Context`);
  }
  run("xcrun", ["stapler", "validate", artifactPath]);
}

function assertNoBlockedExtendedAttributes(appPath) {
  const result = run("xattr", ["-lr", appPath], { required: false });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const blocked = [
    "com.apple.FinderInfo",
    "com.apple.ResourceFork",
    "com.apple.fileprovider.fpfs#P",
    "com.apple.provenance",
    "com.apple.quarantine"
  ].filter((attribute) => output.includes(attribute));

  if (blocked.length) {
    throw new Error(`Blocked extended attributes remain on ${appPath}: ${blocked.join(", ")}`);
  }
}

function run(command, args, options = {}) {
  const required = options.required !== false;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe"
  });

  if (required && result.status !== 0) {
    throw new Error(`Failed to run ${command} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }

  return result;
}
