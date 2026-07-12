# Drift Runner Deployment Contract

`/api/cron/drift-check` persists the result of the Nous substrate command. A
valid local deployment runs the real script against this repository:

```bash
python3 /Users/fcolomas/Projects/nous/Nous/System/nous_package.py drift --strict --target /Users/fcolomas/Projects/mi-banquito
```

The Nous substrate is not part of this serverless application and must not be
vendored into it.

## Vercel prerequisite

Vercel deployments require an independently operated HTTPS runner with:

- `NOUS_DRIFT_RUNNER_URL`: HTTPS endpoint for the runner.
- `NOUS_DRIFT_RUNNER_SECRET`: bearer credential accepted by that endpoint.
- Network and filesystem access to the complete Nous substrate, its modules,
  and its database.

The application sends a logical command request:

```json
{"command":"nous_package.py","args":["drift","--strict"]}
```

The external runner resolves `nous_package.py` to its own real script path and
appends `--target` with the absolute path of its checked-out Mi Banquito
repository before executing without a shell. The resulting command must have
the form `python3 /absolute/path/to/nous_package.py drift --strict --target
/absolute/path/to/mi-banquito`.

The runner must return JSON containing an integer `exitCode` and string
`stdout`, `stderr`, and `rawText` fields. `rawText` preserves the ordered report
shown to operators.

Local executable configuration is deliberately ignored when `VERCEL` is set.
Missing, insecure, or incomplete remote configuration fails closed: the cron
persists exit code `70`, returns HTTP 500, and the admin surface renders red.
It never synthesizes a clean result.

## Local execution

Outside Vercel, configure `NOUS_DRIFT_RUNNER_EXECUTABLE` and a JSON string array
in `NOUS_DRIFT_RUNNER_ARGS`. Pin the trusted script bytes with
`NOUS_DRIFT_SCRIPT_SHA256`. For this checkout, the parser-valid configuration is:

```dotenv
NOUS_DRIFT_RUNNER_EXECUTABLE=python3
NOUS_DRIFT_RUNNER_ARGS=["/Users/fcolomas/Projects/nous/Nous/System/nous_package.py","drift","--strict","--target","/Users/fcolomas/Projects/mi-banquito"]
NOUS_DRIFT_SCRIPT_SHA256=<64-hex-sha256-of-nous-package-py>
```

The validator resolves both paths through the filesystem. The script must be a
real file named `nous_package.py`, the target must resolve to the workspace root
containing `pnpm-workspace.yaml`, and the four command arguments must be exactly
`drift`, `--strict`, `--target`, and that absolute repository path. The command
is passed directly to `spawn` with `shell: false`. Readiness and execution both
compute SHA-256 over the resolved script bytes and require an exact match with
the configured 64-hex digest. A missing, malformed, or stale digest fails closed.

Compute the pin from the reviewed script and update it whenever that script is
intentionally upgraded:

```bash
shasum -a 256 /absolute/path/to/nous_package.py
```

Treat the digest update as a trust decision: review the replacement script,
then deploy its new digest together with the script change. Remote execution
does not use this local file pin; its trust boundary remains the authenticated
runner secret and HTTPS contract described above.

## Operator indicator

`/admin/drift` exposes a non-secret deployment status:

- `remote_runner_ready`: authenticated remote boundary configured.
- `local_runner_ready`: strict local command configured outside Vercel.
- `remote_runner_missing`: Vercel remote URL or secret absent.
- `remote_runner_url_invalid`: production URL is not valid HTTPS.
- `local_runner_missing` / `local_runner_command_invalid`: local prerequisite
  absent or not pinned to `drift --strict`.

Provisioning and operating the external runner is an architectural deployment
prerequisite and remains outside this single Vercel application's runtime.

Runner readiness is the authoritative safety status on `/admin/drift`. When the
runner is unavailable, the primary status is red even if the last persisted
report exited with code `0`; that older report describes historical execution
only and remains visible separately with its timestamp and exit code.
