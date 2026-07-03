import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "./src/lib/sentry/redaction";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    beforeSend(event) {
      return redactSentryEvent(event);
    },
  });
}
