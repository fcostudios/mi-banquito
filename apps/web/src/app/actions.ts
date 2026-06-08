"use server";

// IMP-238 — server actions entrypoint for the serverless backend.
// Mutations run here against the shared Drizzle client from @mi-banquito/db.
import { sql } from "drizzle-orm";
import { db } from "@mi-banquito/db";

export async function ping(): Promise<{ ok: true }> {
  return { ok: true };
}

// IMP-266 / I04 — worked example: a server action consuming the
// @mi-banquito/db workspace package (proves cross-package resolution and
// makes the declared dep live). Real mutations follow this shape
// against a table from @mi-banquito/db/schema; read-only + harmless here.
export async function dbReachable(): Promise<boolean> {
  await db.execute(sql`select 1`);
  return true;
}
