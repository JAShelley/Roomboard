const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const temporaryKeyDirs = [];

exports.default = async function notarizeMacArtifacts(buildResult) {
  const artifactPaths = Array.isArray(buildResult.artifactPaths) ? buildResult.artifactPaths : [];
  const dmgPaths = artifactPaths.filter((artifactPath) => artifactPath.endsWith(".dmg"));
  if (!dmgPaths.length) return [];

  const authArgs = getNotaryAuthArgs();
  const requireNotarization = process.env.ROOMBOARD_REQUIRE_NOTARIZATION === "1";
  if (!authArgs.length) {
    const message = "Skipping Apple DMG notarization because notarization credentials are not configured.";
    if (requireNotarization) throw new Error(message);
    console.log(message);
    return [];
  }

  try {
    for (const dmgPath of dmgPaths) {
      const submit = run("xcrun", [
        "notarytool",
        "submit",
        dmgPath,
        "--wait",
        "--output-format",
        "json",
        ...authArgs
      ]);
      const payload = parseJson(submit.stdout);
      if (payload.status !== "Accepted") {
        if (payload.id) {
          const log = run("xcrun", ["notarytool", "log", payload.id, ...authArgs], { required: false });
          if (log.stdout || log.stderr) {
            console.error(log.stdout || log.stderr);
          }
        }
        throw new Error(`Apple DMG notarization failed with status: ${payload.status || "unknown"}`);
      }

      run("xcrun", ["stapler", "staple", dmgPath]);
      run("xcrun", ["stapler", "validate", dmgPath]);
      console.log(`Apple notarization accepted and stapled for ${dmgPath}`);
    }
  } finally {
    for (const dir of temporaryKeyDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  return [];
};

function getNotaryAuthArgs() {
  const keyId = process.env.APPLE_API_KEY_ID || process.env.ASC_KEY_ID || "";
  const issuer = process.env.APPLE_API_ISSUER || process.env.ASC_ISSUER_ID || "";
  const keyPath = process.env.APPLE_API_KEY_PATH || process.env.ASC_API_KEY_PATH || "";
  const keyValue = process.env.APPLE_API_KEY || process.env.ASC_API_KEY || "";

  if (keyId && issuer && (keyPath || keyValue)) {
    const resolvedKeyPath = resolveApiKeyPath(keyValue || keyPath, keyId);
    return ["--key", resolvedKeyPath, "--key-id", keyId, "--issuer", issuer];
  }

  const appleId = process.env.APPLE_ID || "";
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD || "";
  const teamId = process.env.APPLE_TEAM_ID || "";
  if (appleId && password && teamId) {
    return ["--apple-id", appleId, "--password", password, "--team-id", teamId];
  }

  return [];
}

function resolveApiKeyPath(value, keyId) {
  if (existsSync(value)) return value;
  if (!value.includes("BEGIN PRIVATE KEY")) return value;

  const dir = mkdtempSync(join(tmpdir(), "roomboard-notary-key-"));
  temporaryKeyDirs.push(dir);
  const keyPath = join(dir, `AuthKey_${keyId}.p8`);
  writeFileSync(keyPath, value.replace(/\\n/g, "\n"));
  return keyPath;
}

function run(command, args, options = {}) {
  const required = options.required !== false;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe"
  });

  if (required && result.status !== 0) {
    throw new Error(`Failed to run ${command} ${redactArgs(args).join(" ")}\n${result.stderr || result.stdout}`);
  }

  return result;
}

function redactArgs(args) {
  const redacted = [];
  for (let i = 0; i < args.length; i += 1) {
    redacted.push(args[i]);
    if (["--password", "--key"].includes(args[i])) {
      i += 1;
      redacted.push("[redacted]");
    }
  }
  return redacted;
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    throw new Error(`Could not parse notarytool JSON output: ${error.message}`);
  }
}
