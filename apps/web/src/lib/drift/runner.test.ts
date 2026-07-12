import { createServer } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

import { createConfiguredDriftRunner, getDriftRunnerDeploymentStatus } from "./runner";

describe("configured drift runners", () => {
  it("executes a configured local command without shell interpolation", async () => {
    const literal = "$(printf interpolated)";
    const runner = createConfiguredDriftRunner({
      env: {
        NOUS_DRIFT_RUNNER_EXECUTABLE: process.execPath,
        NOUS_DRIFT_RUNNER_ARGS: JSON.stringify([
          "-e",
          "process.stdout.write(process.argv.slice(1).join('|')); process.stderr.write('stderr-line\\n')",
          literal,
          "drift",
          "--strict",
        ]),
      },
    });

    const result = await runner.run();

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${literal}|drift|--strict`);
    expect(result.stderr).toBe("stderr-line\n");
    expect(result.rawText).toContain(literal);
    expect(result.rawText).toContain("stderr-line\n");
    expect(result.runnerKind).toBe("local");
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
      NOUS_DRIFT_RUNNER_EXECUTABLE: process.execPath,
      NOUS_DRIFT_RUNNER_ARGS: JSON.stringify(["nous_package.py", "drift", "--strict"]),
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
