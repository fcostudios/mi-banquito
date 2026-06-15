// Projection of packages/design-system/tokens.json for UI package consumers.
// Keep this aligned with the canonical source through src/tokens.test.ts.
import designTokens from "../../design-system/tokens.json";

export const uiTokens = {
  color: {
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
  },
} as const;

export const uiColors = uiTokens.color;

export type UiTokens = typeof uiTokens;
export type UiColorToken = keyof typeof uiTokens.color;
