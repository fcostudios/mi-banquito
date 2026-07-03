import { describe, expect, it } from "vitest";
import { redactSentryEvent } from "./redaction";

describe("redactSentryEvent", () => {
  it("masks whatsapp numbers, email domains, and display names", () => {
    const event = redactSentryEvent({
      user: { email: "pancho@fcostudios.io", username: "Pancho" },
      extra: { whatsapp_number: "+593999999999", display_name: "Pancho" },
      breadcrumbs: [
        { message: "display_name Pancho email pancho@fcostudios.io" },
        { message: "username Pancho failed" },
        { message: "name=Pancho" },
      ],
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("+593999999999");
    expect(serialized).not.toContain("@fcostudios.io");
    expect(serialized).not.toContain("Pancho");
    expect(serialized).toContain("[redacted-whatsapp]");
    expect(serialized).toContain("[redacted-name]");
    expect(serialized).toContain("[redacted-email]");
  });

  it("recursively redacts arrays and nested objects without changing primitives", () => {
    expect(redactSentryEvent({
      extra: {
        count: 3,
        nested: [{ email: "tesorera@example.com" }, { display_name: "Maria" }],
      },
    })).toEqual({
      extra: {
        count: 3,
        nested: [{ email: "[redacted-email]" }, { display_name: "[redacted-name]" }],
      },
    });
  });
});
