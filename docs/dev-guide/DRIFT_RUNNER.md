# Drift Runner Deployment Contract

`/api/cron/drift-check` persists the result of the Nous substrate command
`nous_package.py drift --strict`. The Nous substrate is not part of this
serverless application and must not be vendored into it.

## Vercel prerequisite

Vercel deployments require an independently operated HTTPS runner with:

- `NOUS_DRIFT_RUNNER_URL`: HTTPS endpoint for the runner.
- `NOUS_DRIFT_RUNNER_SECRET`: bearer credential accepted by that endpoint.
- Network and filesystem access to the complete Nous substrate, its modules,
  and its database.

The application sends:

```json
{"command":"nous_package.py","args":["drift","--strict"]}
```

The runner must return JSON containing an integer `exitCode` and string
`stdout`, `stderr`, and `rawText` fields. `rawText` preserves the ordered report
shown to operators.

Local executable configuration is deliberately ignored when `VERCEL` is set.
Missing, insecure, or incomplete remote configuration fails closed: the cron
persists exit code `70`, returns HTTP 500, and the admin surface renders red.
It never synthesizes a clean result.

## Local execution

Outside Vercel, configure `NOUS_DRIFT_RUNNER_EXECUTABLE` and a JSON string array
in `NOUS_DRIFT_RUNNER_ARGS`. The argument list must end with `drift` and
`--strict`. It is passed directly to `spawn` with `shell: false`.

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
