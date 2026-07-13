import { z } from "zod";

const nonEmpty = z.string().min(1);

export const serverEnvSchema = z.object({
  APP_BASE_URL: z.string().url(),
  AUTH0_CLIENT_ID: nonEmpty,
  AUTH0_CLIENT_SECRET: nonEmpty,
  AUTH0_DOMAIN: nonEmpty,
  AUTH0_ORGANIZATION: z.string().optional(),
  AUTH0_ORGANIZATION_DB_ORG_ID: z.string().uuid().optional(),
  AUTH0_SECRET: z.string().min(32),
  CRON_SECRET: nonEmpty,
  IMPERSONATION_COOKIE_SECRET: z.string().min(32),
  DATABASE_URL: nonEmpty,
  DB_DRIVER: z.enum(["pg", "neon", "neon-http"]).optional(),
});

export const externalProviderEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.string().url(),
  SENTRY_DSN: z.string().url(),
  BLOB_READ_WRITE_TOKEN: nonEmpty,
});

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

function formatEnvError(error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  return new Error(`Invalid environment configuration: ${details}`);
}

type EnvSource = Record<string, string | undefined>;

export function parseServerEnv(source: EnvSource = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw formatEnvError(parsed.error);
  }
  return parsed.data;
}

export function parseServerEnvForAuthClient(source: EnvSource = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (parsed.success) {
    return parsed.data;
  }

  if (source.VERCEL === "1" && source.VERCEL_ENV === "preview") {
    return {
      APP_BASE_URL: source.APP_BASE_URL ?? "https://preview.invalid",
      AUTH0_CLIENT_ID: source.AUTH0_CLIENT_ID ?? "preview-build-client-id",
      AUTH0_CLIENT_SECRET: source.AUTH0_CLIENT_SECRET ?? "preview-build-client-secret",
      AUTH0_DOMAIN: source.AUTH0_DOMAIN ?? "preview.invalid",
      AUTH0_ORGANIZATION: source.AUTH0_ORGANIZATION,
      AUTH0_ORGANIZATION_DB_ORG_ID: source.AUTH0_ORGANIZATION_DB_ORG_ID,
      AUTH0_SECRET: source.AUTH0_SECRET ?? "00000000000000000000000000000000",
      CRON_SECRET: source.CRON_SECRET ?? "preview-build-cron-secret",
      IMPERSONATION_COOKIE_SECRET:
        source.IMPERSONATION_COOKIE_SECRET ?? "preview-build-impersonation-secret",
      DATABASE_URL:
        source.DATABASE_URL ?? "postgresql://preview:preview@localhost:5432/preview",
      DB_DRIVER:
        source.DB_DRIVER === "pg" || source.DB_DRIVER === "neon" || source.DB_DRIVER === "neon-http"
          ? source.DB_DRIVER
          : undefined,
    };
  }

  throw formatEnvError(parsed.error);
}

export function parsePublicEnv(source: EnvSource = process.env): PublicEnv {
  const parsed = publicEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw formatEnvError(parsed.error);
  }
  return parsed.data;
}

export function parseExternalProviderEnv(source: EnvSource = process.env) {
  const parsed = externalProviderEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw formatEnvError(parsed.error);
  }
  return parsed.data;
}
