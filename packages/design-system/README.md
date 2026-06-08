# Mi Banquito Design System

Design tokens + Tailwind preset for Mi Banquito, generated from the project's
Step-6 design system (`06_design_system_summary.json`).

## Contents

- `tokens.json` — canonical color / spacing / typography / radius tokens
- `tailwind-preset.js` — Tailwind preset extending the default theme
- `tokens.css` — CSS custom properties

## Not a workspace package — a token-asset directory

This directory is a **token-asset dir**, NOT a workspace package: it has no
`package.json` and is not part of the pnpm workspace — there is no
`@<scope>/design-system` module to import. The token data here is the
canonical source the generator derives `apps/web/src/styles/tokens.css`
(`@theme`) from, and that `@theme` block (imported by `globals.css`) is what
the app actually renders under Tailwind v4. `apps/web/tailwind.config.ts`
references the preset here but is **inert** under v4 (not auto-loaded — no
`@config` directive).

## Status colors — single source of truth

The semantic (status) hexes below MUST only ever be rendered by the
`status-pill` atom. Any color literal matching a semantic hex outside the
status-pill component is a build failure (see `scripts/check-status-pill.mjs`).

## Tokens

| Token | Hex | Usage |
|-------|-----|-------|
        | accent | #C45F36 | brand |
| background | #F8F4E9 | brand |
| border | #CBD5E1 | brand |
| primary | #2D7A4F | brand |
| secondary | #1E5180 | brand |
| surface | #FFFFFF | brand |
| surface_muted | #E2E8F0 | brand |
| text_on_primary | #F8F4E9 | brand |
| text_primary | #0F172A | brand |
| text_secondary | #475569 | brand |
| error_bg | #FECACA | semantic (status colors — render ONLY via the status-pill atom) |
| error_text | #B91C1C | semantic (status colors — render ONLY via the status-pill atom) |
| info_bg | #FDE68A | semantic (status colors — render ONLY via the status-pill atom) |
| info_text | #B45309 | semantic (status colors — render ONLY via the status-pill atom) |
| success | #15803D | semantic (status colors — render ONLY via the status-pill atom) |
| warning_bg | #FED7AA | semantic (status colors — render ONLY via the status-pill atom) |
| warning_text | #C2410C | semantic (status colors — render ONLY via the status-pill atom) |
