# Nous Feedback — Events & AC Verification

How agents report progress to Nous. See `CLAUDE.md` for the summary;
this file is the authoritative event schema.

## Where to Write

Append one JSON object per line to `.nous-feedback.jsonl` at the repo root.
`ts` is optional (git fallback). Nous's `pull` command reads this file to update
story status, add annotations, and register decisions.

## Event Types

| Event | When | Required fields |
|-------|------|-----------------|
| `started` | Begin a story | `story`, `event`, `agent` |
| `ac_pass` | An acceptance criterion passes | `story`, `event`, `ac`, `notes` |
| `ac_verify` | Adversarial verification of one AC | `story`, `event`, `ac`, `method`, `pass`, `notes` |
| `build_pass` | type-check + lint + build pass | `story`, `event`, `notes` |
| `done` | Story complete, all AC + build passing | `story`, `event` |
| `blocked` | Can't proceed | `story`, `event`, `reason`, `needs` |
| `deviation` | Spec divergence | `story`, `event`, `notes` |
| `decision` | Technical decision made | `story`, `event`, `id`, `text`, `reason` |
| `feedback` | Visual/UX issue with screenshot evidence | `story`, `event`, `title`, `description`, `images` |

## Example Stream

```jsonl
{"story":"US-064","event":"started","agent":"claude-code"}
{"story":"US-064","event":"ac_pass","ac":1,"notes":"socias list renders"}
{"story":"US-064","event":"ac_verify","ac":1,"method":"route check","pass":true,"notes":"empty state renders"}
{"story":"US-064","event":"build_pass","notes":"pnpm type-check && pnpm lint && pnpm build all green"}
{"story":"US-064","event":"done"}
{"story":"US-064","event":"feedback","title":"Button label wrong","description":"Save says Submit","images":["screenshots/us064-submit-btn.png"]}
```

For `feedback` events, save images under a `screenshots/` folder at the repo root
and list their repo-relative paths in `images`.

## AC Verification Protocol (MANDATORY before `done`)

**Never mark `done` without adversarial verification — try to BREAK each AC.**

| AC Type | Adversarial Check |
|---------|-------------------|
| **Navigation** | Verify the link exists in `apps/web/src/app/`, no competing link. |
| **Data display** | Verify the route handler is called; check empty/null/error; ALL fields render. |
| **Role visibility** | Verify the role gate exists; test with the WRONG role → hide/403. |
| **Button/action** | Button exists, handler routes correctly, not disabled by default. |
| **Empty/error states** | Navigate with no data — empty state renders with the exact CTA. |
| **API contract** | Handler path matches the TOON `dataSource`; request/response shape matches. |

Read like a QA tester finding bugs: check exact wording, test the negative case,
verify integration (not just existence), and grep the codebase.

## Canonical Event Vocabulary (authoritative)

Canonical event vocabulary (single source: `feedback_schemas`). Unknown event names are surfaced by `pull`/`drift`, never silently dropped:

- **Lifecycle (flip story status):** `started`, `done`, `verified`
- **Terminal-with-deferral (→ dev_done + deferral note; prefer plain `done`):** `done_with_deferral`, `done_with_external_deferral`
- **Annotation (recorded, no status change):** `ac_pass`, `ac_verify`, `blocked`, `blocker`, `deviation`, `ac_fail`, `ac_unverifiable`, `test_report`, `feedback`
- **Decision (registered):** `decision`
- **Sprint-level marker (project audit trail, never flips a story):** `closed_with_deferrals`, `adversarial_review`, `deferred_memory_saved`, `closure_hygiene`, `implemented_with_external_verification`
- **Informational (counted, not persisted):** `build_pass`

Any `done_with_<qualifier>` event is recognized as terminal (recorded as a deferral); prefer plain `done` when there is no caveat.
