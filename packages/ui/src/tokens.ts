// Projection of packages/design-system/tokens.json for UI package consumers.
// Keep this aligned with the canonical source through src/tokens.test.ts.
export const uiTokens = {
  color: {
    accent: "#C45F36",
    background: "#F8F4E9",
    border: "#CBD5E1",
    primary: "#2D7A4F",
    secondary: "#1E5180",
    surface: "#FFFFFF",
    surfaceMuted: "#E2E8F0",
    textOnPrimary: "#F8F4E9",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
  },
} as const;

export const uiColors = uiTokens.color;

export type UiTokens = typeof uiTokens;
export type UiColorToken = keyof typeof uiTokens.color;
