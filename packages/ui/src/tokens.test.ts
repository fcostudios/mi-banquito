import designTokens from "../../design-system/tokens.json";
import { describe, expect, it } from "vitest";

import { uiTokens } from "./tokens";

describe("UI design tokens", () => {
  it("exports the brand color tokens from the canonical design-system source", () => {
    expect(uiTokens.color).toEqual({
      accent: designTokens.color.accent,
      background: designTokens.color.background,
      border: designTokens.color.border,
      primary: designTokens.color.primary,
      secondary: designTokens.color.secondary,
      surface: designTokens.color.surface,
      surfaceMuted: designTokens.color.surface_muted,
      textOnPrimary: designTokens.color.text_on_primary,
      textPrimary: designTokens.color.text_primary,
      textSecondary: designTokens.color.text_secondary,
    });
  });
});
