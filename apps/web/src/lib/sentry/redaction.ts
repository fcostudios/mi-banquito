const sensitiveNameKeys = new Set(["display_name", "displayName", "username", "name"]);
const sensitivePhoneKeys = new Set(["whatsapp_number", "whatsappNumber", "phone", "phoneNumber"]);
const sensitiveEmailKeys = new Set(["email"]);

function redactString(value: string) {
  return value
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[redacted-whatsapp]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(display_name|username|name)\b\s*[:=]?\s*[\p{L}\s.'-]+/giu, "$1 [redacted-name]");
}

function redactJson(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (sensitivePhoneKeys.has(key)) {
        return [key, "[redacted-whatsapp]"];
      }
      if (sensitiveNameKeys.has(key)) {
        return [key, "[redacted-name]"];
      }
      if (sensitiveEmailKeys.has(key)) {
        return [key, "[redacted-email]"];
      }
      return [key, redactJson(item)];
    }));
  }
  return value;
}

export function redactSentryEvent<T>(event: T): T {
  return redactJson(event) as T;
}
