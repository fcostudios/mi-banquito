import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

describe("US-008 Neon pull-request schema gate", () => {
  it("uses an expiring isolated branch only for trusted pull requests", () => {
    expect(workflow).toContain("neondatabase/create-branch-action@v6");
    expect(workflow).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(workflow).not.toContain("pull_request_target");
    expect(workflow).toContain("project_id: ${{ vars.NEON_PROJECT_ID }}");
    expect(workflow).toContain("api_key: ${{ secrets.NEON_API_KEY }}");
    expect(workflow).toContain("expires_at: ${{ env.NEON_EXPIRES_AT }}");
    expect(workflow).toContain(
      "DATABASE_URL: ${{ steps.create_neon_branch.outputs.db_url }}",
    );
  });

  it("applies and verifies twice before running the focused PostgreSQL contracts", () => {
    expect(workflow.match(/node scripts\/apply-local-schema\.mjs/g)).toHaveLength(3);
    expect(workflow.match(/node scripts\/verify-schema\.mjs/g)).toHaveLength(3);
    expect(workflow).toContain("src/tenant.test.ts");
    expect(workflow).toContain("src/sprint3-substrate.test.ts");
    expect(workflow).toContain("src/interest-gains-schema.test.ts");
    expect(workflow).toContain("src/fail-closed-rls.test.ts");
    expect(workflow).toContain("--maxWorkers=1");
  });
});
