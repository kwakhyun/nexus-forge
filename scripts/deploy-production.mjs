import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { deploymentAccess } from "./verify-production.mjs";

const execFileAsync = promisify(execFile);

async function execute(command, args, env) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      env,
      timeout: 15 * 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    // Do not echo child-process output, which may contain pulled environment values.
    throw new Error(`${command} ${args[0]} failed; the release was stopped`);
  }
}

export async function deployProduction({ env = process.env, run = execute, log = console.log } = {}) {
  for (const name of ["EXPECTED_RELEASE", "PRODUCTION_URL", "VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    if (!env[name]?.trim()) throw new Error(`${name} is not configured`);
  }
  const release = env.EXPECTED_RELEASE;
  if (!/^[a-f0-9]{40}$/.test(release)) throw new Error("EXPECTED_RELEASE must be a full Git commit SHA");
  deploymentAccess(env.PRODUCTION_URL);

  const cleanEnv = { ...env, GITHUB_SHA: release, VERCEL_GIT_COMMIT_SHA: release, NEXUS_RELEASE_SHA: release };
  delete cleanEnv.VERCEL_TOKEN;
  delete cleanEnv.VERCEL_AUTOMATION_BYPASS_SECRET;
  delete cleanEnv.VERCEL_DEPLOY_HOOK_URL;
  const authenticatedEnv = { ...cleanEnv, VERCEL_TOKEN: env.VERCEL_TOKEN };
  const smokeEnv = { ...cleanEnv, VERCEL_AUTOMATION_BYPASS_SECRET: env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "" };

  if ((await run("git", ["rev-parse", "HEAD"], cleanEnv)).trim() !== release) {
    throw new Error("The checkout does not match the commit that passed CI");
  }

  async function isCurrentMain() {
    const remote = await run("git", ["ls-remote", "origin", "refs/heads/main"], cleanEnv);
    const match = remote.trim().match(/^([a-f0-9]{40})\s+refs\/heads\/main$/);
    if (!match) throw new Error("Could not resolve the current main commit; refusing to release");
    if (match[1] === release) return true;
    log(`Skipping release ${release.slice(0, 7)} because main has advanced.`);
    return false;
  }

  if (!await isCurrentMain()) return { promoted: false };
  log(`Building the checked-out release ${release.slice(0, 7)} for production.`);
  await run("vercel", ["pull", "--yes", "--environment=production"], authenticatedEnv);
  await run("vercel", ["build", "--prod"], cleanEnv);

  // Upload this checkout's build output, without assigning any production domains.
  const deploymentUrl = (await run("vercel", [
    "deploy", "--prebuilt", "--prod", "--skip-domain", "--yes",
    "--meta", `githubCommitSha=${release}`,
    "--env", `NEXUS_RELEASE_SHA=${release}`,
  ], authenticatedEnv)).trim();
  const url = new URL(deploymentUrl);
  if (url.protocol !== "https:" || url.origin !== deploymentUrl || !url.hostname.endsWith(".vercel.app")) {
    throw new Error("Vercel did not return a valid immutable deployment URL");
  }

  log(`Verifying the staged release ${release.slice(0, 7)} before promotion.`);
  await run(process.execPath, ["scripts/verify-production.mjs"], { ...smokeEnv, PRODUCTION_URL: deploymentUrl });
  // A slower old run must not replace a newer release. CI serializes this whole job.
  if (!await isCurrentMain()) return { promoted: false, deploymentUrl };
  await run("vercel", ["promote", deploymentUrl, "--yes"], authenticatedEnv);
  await run(process.execPath, ["scripts/verify-production.mjs"], smokeEnv);
  log(`Promoted and verified release ${release.slice(0, 7)}.`);
  return { promoted: true, deploymentUrl };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await deployProduction();
}
