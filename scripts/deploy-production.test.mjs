import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deployProduction } from "./deploy-production.mjs";
import { deploymentAccess } from "./verify-production.mjs";

const release = "a".repeat(40);
const newerRelease = "b".repeat(40);
const deploymentUrl = "https://nexus-forge-immutable.vercel.app";
const config = {
  EXPECTED_RELEASE: release,
  PRODUCTION_URL: "https://nexus-forge-ten.vercel.app",
  VERCEL_TOKEN: "test-token",
  VERCEL_ORG_ID: "team_test",
  VERCEL_PROJECT_ID: "prj_test",
  VERCEL_AUTOMATION_BYPASS_SECRET: "test-bypass",
};

function fixture(options = {}) {
  const calls = [];
  let mainReads = 0;
  const run = async (command, args, env) => {
    const step = command === process.execPath ? "verify" : args[0];
    calls.push({ command, args, env, step });
    if (step === options.failStep) throw new Error(`Mock ${step} failure`);
    switch (step) {
      case "rev-parse": return options.checkout ?? release;
      case "ls-remote": {
        const current = options.mainCommits?.[mainReads++] ?? release;
        return current === "unavailable" ? "" : `${current}\trefs/heads/main`;
      }
      case "deploy": return options.deploymentUrl ?? deploymentUrl;
      default: return "";
    }
  };
  return { calls, run, env: { ...config, ...options.env }, log() {} };
}

test("stages only the checked-out build, verifies it, and promotes the same deployment", async () => {
  const context = fixture();
  assert.deepEqual(await deployProduction(context), { promoted: true, deploymentUrl });
  assert.deepEqual(context.calls.map(({ step }) => step), [
    "rev-parse", "ls-remote", "pull", "build", "deploy", "verify", "ls-remote", "promote", "verify",
  ]);
  const deployment = context.calls.find(({ step }) => step === "deploy");
  assert.deepEqual(deployment.args, [
    "deploy", "--prebuilt", "--prod", "--skip-domain", "--yes",
    "--meta", `githubCommitSha=${release}`, "--env", `NEXUS_RELEASE_SHA=${release}`,
  ]);
  const verification = context.calls.filter(({ step }) => step === "verify");
  assert.equal(verification[0].env.PRODUCTION_URL, deploymentUrl);
  assert.equal(verification[1].env.PRODUCTION_URL, config.PRODUCTION_URL);
  assert.ok(verification.every(({ env }) => env.EXPECTED_RELEASE === release));
  assert.deepEqual(context.calls.find(({ step }) => step === "promote").args, ["promote", deploymentUrl, "--yes"]);
});

test("exposes the deployment token only to Vercel commands that authenticate", async () => {
  const context = fixture();
  await deployProduction(context);
  for (const { step, env, args } of context.calls) {
    assert.equal(env.VERCEL_TOKEN, ["pull", "deploy", "promote"].includes(step) ? config.VERCEL_TOKEN : undefined);
    assert.equal(env.VERCEL_AUTOMATION_BYPASS_SECRET, step === "verify" ? config.VERCEL_AUTOMATION_BYPASS_SECRET : undefined);
    assert.ok(!args.some((argument) => argument.includes(config.VERCEL_TOKEN)));
    assert.equal(env.GITHUB_SHA, release);
    assert.equal(env.VERCEL_GIT_COMMIT_SHA, release);
    assert.equal(env.NEXUS_RELEASE_SHA, release);
  }
});

test("does not start a release when main advanced while quality checks were running", async () => {
  const context = fixture({ mainCommits: [newerRelease] });
  assert.deepEqual(await deployProduction(context), { promoted: false });
  assert.deepEqual(context.calls.map(({ step }) => step), ["rev-parse", "ls-remote"]);
});

test("a newer push during staging cannot publish the new commit or promote the old run", async () => {
  const context = fixture({ mainCommits: [release, newerRelease] });
  assert.deepEqual(await deployProduction(context), { promoted: false, deploymentUrl });
  assert.ok(context.calls.some(({ step }) => step === "verify"));
  assert.ok(!context.calls.some(({ step }) => step === "promote"));
  assert.ok(context.calls.every(({ args }) => !args.some((argument) => argument.includes(newerRelease))));
});

test("refuses a checkout that differs from the tested commit", async () => {
  const context = fixture({ checkout: newerRelease });
  await assert.rejects(deployProduction(context), /checkout does not match/);
  assert.equal(context.calls.length, 1);
});

for (const failStep of ["pull", "build", "deploy", "verify"]) {
  test(`${failStep} failure prevents promotion`, async () => {
    const context = fixture({ failStep });
    await assert.rejects(deployProduction(context), new RegExp(`Mock ${failStep} failure`));
    assert.ok(!context.calls.some(({ step }) => step === "promote"));
  });
}

test("an unreadable main ref before promotion fails closed", async () => {
  const context = fixture({ mainCommits: [release, "unavailable"] });
  await assert.rejects(deployProduction(context), /Could not resolve/);
  assert.ok(!context.calls.some(({ step }) => step === "promote"));
});

test("missing deployment configuration fails before any side effect", async () => {
  for (const name of ["EXPECTED_RELEASE", "PRODUCTION_URL", "VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    const context = fixture({ env: { [name]: "" } });
    await assert.rejects(deployProduction(context), new RegExp(`${name} is not configured`));
    assert.equal(context.calls.length, 0);
  }
});

test("branch names and invalid public origins cannot start a release", async () => {
  for (const env of [{ EXPECTED_RELEASE: "main" }, { PRODUCTION_URL: "http://example.com" }]) {
    const context = fixture({ env });
    await assert.rejects(deployProduction(context));
    assert.equal(context.calls.length, 0);
  }
});

test("untrusted CLI output cannot receive smoke credentials or be promoted", async () => {
  for (const url of ["https://example.com", "https://example.vercel.app/path", "https://example.vercel.app?token=value", "https://user:password@example.vercel.app", "https://example.vercel.app\nextra output"]) {
    const context = fixture({ deploymentUrl: url });
    await assert.rejects(deployProduction(context));
    assert.ok(!context.calls.some(({ step }) => ["verify", "promote"].includes(step)));
  }
});

test("protected deployments receive bypass on both HTTP and WebSocket requests", () => {
  const access = deploymentAccess(deploymentUrl, "token&with=symbols");
  assert.equal(access.headers["x-vercel-protection-bypass"], "token&with=symbols");
  const stream = new URL(access.streamUrl("COATER-02"));
  assert.equal(stream.protocol, "wss:");
  assert.equal(stream.searchParams.get("equipmentId"), "COATER-02");
  assert.equal(stream.searchParams.get("x-vercel-protection-bypass"), "token&with=symbols");
});

test("public deployments need no protection bypass", () => {
  const access = deploymentAccess(`${deploymentUrl}/`);
  assert.deepEqual(access.headers, { "Cache-Control": "no-cache" });
  assert.equal(access.streamUrl("DRYER-02"), "wss://nexus-forge-immutable.vercel.app/stream?equipmentId=DRYER-02");
});

test("CI gates and serializes production releases at the tested checkout", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /needs: \[quality, e2e\]/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /group: production-release\s+cancel-in-progress: false/);
  assert.match(workflow, /EXPECTED_RELEASE: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /run: node scripts\/deploy-production\.mjs/);
  assert.doesNotMatch(workflow, /VERCEL_DEPLOY_HOOK_URL/);
});
