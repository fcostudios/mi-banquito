import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "./src/lib/sentry/redaction";

export async function register() {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    beforeSend(event) {
      return redactSentryEvent(event);
    },
  });
}
