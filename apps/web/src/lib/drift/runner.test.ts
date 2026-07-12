import { createServer } from "node:http";
import { once } from "node:events";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createConfiguredDriftRunner, getDriftRunnerDeploymentStatus } from "./runner";

describe("configured drift runners", () => {
  const temporaryDirectories: string[] = [];
  const repoRoot = resolve(process.cwd(), "../..");

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  async function executableNousPackage() {
    const directory = await mkdtemp(join(tmpdir(), "mi-banquito-drift-"));
    temporaryDirectories.push(directory);
    const script = join(directory, "nous_package.py");
    await writeFile(script, "#!/usr/bin/env node\nprocess.stdout.write(process.argv.slice(2).join('|'))\n");
    await chmod(script, 0o755);
    return script;
  }

  it("executes only a real direct nous_package.py command against this repository", async () => {
    const script = await executableNousPackage();
    const runner = createConfiguredDriftRunner({
      env: {
        NOUS_DRIFT_RUNNER_EXECUTABLE: script,
        NOUS_DRIFT_RUNNER_ARGS: JSON.stringify([
          "drift",
          "--strict",
          "--target",
          repoRoot,
        ]),
      },
    });

    const result = await runner.run();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`drift|--strict|--target|${repoRoot}`);
    expect(result.stderr).toBe("");
    expect(result.runnerKind).toBe("local");
  });

  it("accepts python only when it receives an existing nous_package.py and the exact target contract", async () => {
    const script = await executableNousPackage();
    const env = {
      NOUS_DRIFT_RUNNER_EXECUTABLE: "python3",
      NOUS_DRIFT_RUNNER_ARGS: JSON.stringify([script, "drift", "--strict", "--target", repoRoot]),
    };

    expect(getDriftRunnerDeploymentStatus(env)).toEqual({
      ready: true,
      mode: "local",
      code: "local_runner_ready",
    });
  });

  it.each([
    ["arbitrary executable", "/usr/bin/true", ["drift", "--strict", "--target", repoRoot]],
    ["missing script", "python3", [join(tmpdir(), "missing-nous_package.py"), "drift", "--strict", "--target", repoRoot]],
  ])("rejects %s in local readiness", (_case, executable, args) => {
    expect(getDriftRunnerDeploymentStatus({
      NOUS_DRIFT_RUNNER_EXECUTABLE: executable,
      NOUS_DRIFT_RUNNER_ARGS: JSON.stringify(args),
    })).toEqual({
      ready: false,
      mode: "unavailable",
      code: "local_runner_command_invalid",
    });
  });

  it("rejects missing, wrong, and shell-extended targets after validating the real script", async () => {
    const script = await executableNousPackage();
    const invalidArguments = [
      [script, "drift", "--strict"],
      [script, "drift", "--strict", "--target", tmpdir()],
      [script, "drift", "--strict", "--target", repoRoot, ";", "true"],
    ];

    for (const args of invalidArguments) {
      expect(getDriftRunnerDeploymentStatus({
        NOUS_DRIFT_RUNNER_EXECUTABLE: "python3",
        NOUS_DRIFT_RUNNER_ARGS: JSON.stringify(args),
      })).toEqual({
        ready: false,
        mode: "unavailable",
        code: "local_runner_command_invalid",
      });
    }
  });

  it("calls the authenticated remote runner in Vercel and preserves its raw response", async () => {
    let authorization: string | undefined;
    let requestBody = "";
    const server = createServer((request, response) => {
      authorization = request.headers.authorization;
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => { requestBody += chunk; });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          exitCode: 4,
          stdout: "SECTION routes\n",
          stderr: "strict failed\n",
          rawText: "SECTION routes\nstrict failed\n",
        }));
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");

    try {
      const runner = createConfiguredDriftRunner({
        env: {
          VERCEL: "1",
          NODE_ENV: "test",
          NOUS_DRIFT_RUNNER_URL: `http://127.0.0.1:${address.port}/drift`,
          NOUS_DRIFT_RUNNER_SECRET: "runner-secret",
        },
      });

      expect(getDriftRunnerDeploymentStatus({
        VERCEL: "1",
        NODE_ENV: "test",
        NOUS_DRIFT_RUNNER_URL: `http://127.0.0.1:${address.port}/drift`,
        NOUS_DRIFT_RUNNER_SECRET: "runner-secret",
      })).toEqual({ ready: true, mode: "remote", code: "remote_runner_ready" });
      await expect(runner.run()).resolves.toEqual({
        exitCode: 4,
        stdout: "SECTION routes\n",
        stderr: "strict failed\n",
        rawText: "SECTION routes\nstrict failed\n",
        runnerKind: "remote",
      });
      expect(authorization).toBe("Bearer runner-secret");
      expect(JSON.parse(requestBody)).toEqual({ command: "nous_package.py", args: ["drift", "--strict"] });
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("fails closed when no runner is available", async () => {
    const runner = createConfiguredDriftRunner({ env: { VERCEL: "1" } });

    expect(getDriftRunnerDeploymentStatus({ VERCEL: "1" })).toEqual({
      ready: false,
      mode: "unavailable",
      code: "remote_runner_missing",
    });
    await expect(runner.run()).rejects.toThrow("drift_runner_unavailable:remote_runner_missing");
  });

  it("never treats a local executable as deployable inside Vercel", async () => {
    const env = {
      VERCEL: "1",
      NOUS_DRIFT_RUNNER_EXECUTABLE: "/usr/bin/true",
      NOUS_DRIFT_RUNNER_ARGS: JSON.stringify(["drift", "--strict", "--target", repoRoot]),
    };

    expect(getDriftRunnerDeploymentStatus(env)).toEqual({
      ready: false,
      mode: "unavailable",
      code: "remote_runner_missing",
    });
    await expect(createConfiguredDriftRunner({ env }).run())
      .rejects.toThrow("drift_runner_unavailable:remote_runner_missing");
  });

  it("rejects insecure production runner URLs in deployment validation", () => {
    expect(getDriftRunnerDeploymentStatus({
      VERCEL: "1",
      NOUS_DRIFT_RUNNER_URL: "http://runner.example.com/drift",
      NOUS_DRIFT_RUNNER_SECRET: "secret",
    })).toEqual({
      ready: false,
      mode: "unavailable",
      code: "remote_runner_url_invalid",
    });
  });
});
