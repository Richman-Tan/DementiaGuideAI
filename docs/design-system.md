# Design system

Tokens live in `apps/mobile/src/theme/` (`colors.ts`, `typography.ts`) for mobile and
`apps/web/src/styles/` for web. Both surfaces share the same palette.

## Colour

| Token | Value | Use |
|---|---|---|
| Primary | `#4A7C8E` | Buttons, links, user bubbles |
| Secondary | `#7FB5A0` | Accents, success states |
| Accent | `#E8956D` | Warnings, speaking state |
| Background | `#F7F5F2` | App background |
| Surface | `#FFFFFF` | Cards, nav bar |
| Text primary | `#1E2D3D` | Body and headings |

## Accessibility

The primary users are often older, stressed, or non-technical, so these are
requirements rather than nice-to-haves:

- Minimum 44×44 pt tap targets
- `accessibilityLabel` and `accessibilityRole` on every interactive element
- Configurable text size (small / medium / large)
- High-contrast mode toggle
- Subtitle and audio toggles for avatar responses
- Haptic feedback toggle

Settings are applied before first paint so there is no flash of the wrong theme
or text size. On web that is an inline bootstrap script in `index.html`, allowed
by a sha256 hash in the CSP — `apps/web/tests/csp.test.js` keeps the hash in sync and
fails the build if the script changes without it.
