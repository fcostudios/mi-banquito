import { z } from "zod";

const nonEmpty = z.string().min(1);

export const serverEnvSchema = z.object({
  APP_BASE_URL: z.string().url(),
  AUTH0_CLIENT_ID: nonEmpty,
  AUTH0_CLIENT_SECRET: nonEmpty,
  AUTH0_DOMAIN: nonEmpty,
  AUTH0_ORGANIZATION: z.string().optional(),
  AUTH0_SECRET: z.string().min(32),
  CRON_SECRET: nonEmpty,
  DATABASE_URL: nonEmpty,
  DB_DRIVER: z.enum(["pg", "neon"]).optional(),
});

export const externalProviderEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.string().url(),
  SENTRY_DSN: z.string().url(),
  VERCEL_BLOB_READ_WRITE_TOKEN: nonEmpty,
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
