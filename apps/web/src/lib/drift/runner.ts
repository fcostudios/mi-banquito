import { spawn } from "node:child_process";

import type { DriftRunner, DriftRunnerResult } from "@mi-banquito/domain";

type RunnerEnvironment = Record<string, string | undefined>;

export type DriftRunnerDeploymentStatus =
  | { ready: true; mode: "remote"; code: "remote_runner_ready" }
  | { ready: true; mode: "local"; code: "local_runner_ready" }
  | {
      ready: false;
      mode: "unavailable";
      code: "remote_runner_missing" | "remote_runner_url_invalid" | "local_runner_missing" | "local_runner_command_invalid";
    };

function parseArgs(value: string | undefined): string[] {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("NOUS_DRIFT_RUNNER_ARGS must be a JSON string array");
  }
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("NOUS_DRIFT_RUNNER_ARGS must be a JSON string array");
  }
  return parsed;
}

function isAllowedRemoteUrl(value: string, allowLocalHttp: boolean): boolean {
  try {
    const url = new URL(value);
    const localHttp = allowLocalHttp
      && url.protocol === "http:"
      && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    return url.protocol === "https:" || localHttp;
  } catch {
    return false;
  }
}

export function getDriftRunnerDeploymentStatus(
  env: RunnerEnvironment = process.env,
): DriftRunnerDeploymentStatus {
  // Vercel cannot host the Nous substrate or safely spawn its local process tree.
  // Production is ready only when the authenticated remote execution boundary exists.
  if (env.VERCEL) {
    if (!env.NOUS_DRIFT_RUNNER_URL || !env.NOUS_DRIFT_RUNNER_SECRET) {
      return { ready: false, mode: "unavailable", code: "remote_runner_missing" };
    }
    if (!isAllowedRemoteUrl(env.NOUS_DRIFT_RUNNER_URL, env.NODE_ENV === "test")) {
      return { ready: false, mode: "unavailable", code: "remote_runner_url_invalid" };
    }
    return { ready: true, mode: "remote", code: "remote_runner_ready" };
  }

  if (!env.NOUS_DRIFT_RUNNER_EXECUTABLE) {
    return { ready: false, mode: "unavailable", code: "local_runner_missing" };
  }
  try {
    const args = parseArgs(env.NOUS_DRIFT_RUNNER_ARGS);
    if (args.at(-2) !== "drift" || args.at(-1) !== "--strict") {
      return { ready: false, mode: "unavailable", code: "local_runner_command_invalid" };
    }
  } catch {
    return { ready: false, mode: "unavailable", code: "local_runner_command_invalid" };
  }
  return { ready: true, mode: "local", code: "local_runner_ready" };
}

function createLocalRunner(executable: string, args: string[], env: RunnerEnvironment): DriftRunner {
  return {
    run: () => new Promise<DriftRunnerResult>((resolve, reject) => {
      const child = spawn(executable, args, {
        env: { ...process.env, ...env },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const rawChunks: string[] = [];
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        rawChunks.push(chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        rawChunks.push(chunk);
      });
      child.once("error", reject);
      child.once("close", (code, signal) => {
        resolve({
          exitCode: code ?? (signal ? 70 : 0),
          stdout,
          stderr,
          rawText: rawChunks.join(""),
          runnerKind: "local",
        });
      });
    }),
  };
}

function parseRemoteResult(value: unknown): Omit<DriftRunnerResult, "runnerKind"> {
  if (!value || typeof value !== "object") throw new Error("drift_runner_invalid_response");
  const result = value as Record<string, unknown>;
  if (
    typeof result.exitCode !== "number"
    || !Number.isInteger(result.exitCode)
    || typeof result.stdout !== "string"
    || typeof result.stderr !== "string"
    || typeof result.rawText !== "string"
  ) {
    throw new Error("drift_runner_invalid_response");
  }
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    rawText: result.rawText,
  };
}

function createRemoteRunner(urlValue: string, secret: string): DriftRunner {
  const url = new URL(urlValue);

  return {
    async run() {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ command: "nous_package.py", args: ["drift", "--strict"] }),
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`drift_runner_http_${response.status}`);
      return { ...parseRemoteResult(await response.json()), runnerKind: "remote" };
    },
  };
}

export function createConfiguredDriftRunner(options: { env?: RunnerEnvironment } = {}): DriftRunner {
  const env = options.env ?? process.env;
  const deployment = getDriftRunnerDeploymentStatus(env);
  if (!deployment.ready) {
    return { run: async () => { throw new Error(`drift_runner_unavailable:${deployment.code}`); } };
  }
  if (deployment.mode === "remote") {
    return createRemoteRunner(env.NOUS_DRIFT_RUNNER_URL!, env.NOUS_DRIFT_RUNNER_SECRET!);
  }
  return createLocalRunner(
    env.NOUS_DRIFT_RUNNER_EXECUTABLE!,
    parseArgs(env.NOUS_DRIFT_RUNNER_ARGS),
    env,
  );
}
