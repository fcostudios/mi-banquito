import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import * as schema from "./schema";

const recoveryMigration = readdirSync(new URL("./migrations", import.meta.url))
  .filter((name) => name.includes("close_artifact_recovery"))
  .map((name) => readFileSync(new URL(`./migrations/${name}`, import.meta.url), "utf8"))
  .join("\n");

describe("Task 4 durable close artifact schema", () => {
  it("models append-only artifact attempts with ready byte size and tenant isolation", () => {
    const artifactEvent = (schema as Record<string, unknown>).statementArtifactEvent as Record<string, { name: string }> | undefined;

    expect(artifactEvent).toBeDefined();
    expect(artifactEvent?.statementArchiveId.name).toBe("statement_archive_id");
    expect(artifactEvent?.status.name).toBe("status");
    expect(artifactEvent?.byteSize.name).toBe("byte_size");
    expect(artifactEvent?.attemptNumber.name).toBe("attempt_number");
    expect(getTableConfig(schema.statementArtifactEvent).indexes.map((index) => index.config.name)).toContain(
      "uq_statement_artifact_event_ready",
    );
    expect(recoveryMigration).toContain("statement_artifact_event_no_mutate");
    expect(recoveryMigration).toContain("statement_artifact_event_tenant_isolation");
    expect(recoveryMigration).toContain("WHERE status = 'ready'");
  });

  it("persists the immutable submitted payment command independently of allocations", () => {
    const receipt = schema.paymentReceipt as unknown as Record<string, { name: string }>;

    expect(receipt.commandPayload?.name).toBe("command_payload");
    expect(recoveryMigration).toContain("ADD COLUMN IF NOT EXISTS command_payload jsonb");
  });
});
