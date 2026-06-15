import { existsSync } from "node:fs";
import { join } from "node:path";
import { uiColors } from "@mi-banquito/ui";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  it("declares installable icons and uses the primary design token color", () => {
    const value = manifest();

    expect(value.name).toBe("Mi Banquito");
    expect(value.theme_color).toBe(uiColors.primary);
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512" }),
        expect.objectContaining({ src: "/icons/apple-touch-icon.png", sizes: "180x180" }),
      ]),
    );

    for (const icon of value.icons ?? []) {
      if (typeof icon.src === "string" && icon.src.startsWith("/icons/")) {
        expect(existsSync(join(process.cwd(), "public", icon.src))).toBe(true);
      }
    }
  });
});
