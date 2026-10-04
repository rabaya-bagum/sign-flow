# Accessibility audit (Phase 8)

The audit covers SPEC §16 against WCAG 2.1 AA. It has two parts:

- an automated pass in a real browser, on the web build of the same React Native code;
- a manual checklist for devices, which has to be run on iOS and Android builds.

## Automated: axe-core and touch targets

`node tests/e2e/a11y-audit.mjs` (`--verbose` for the failing elements, `--json out.json` for a report)
does two things on each screen below:

- runs axe-core 4.13 with the WCAG 2.0/2.1 A and AA rules;
- checks that every control is at least 44×44 pt, or sits inside a tappable row of that size.

It fails on serious or critical violations.

Screens covered: onboarding, welcome, sign-in, Home, Documents, document details, Activity, inbox,
Account, Security, two-factor setup, delete account, notification settings, new document (source),
field editor, guest signing page (consent, then signing).

**First run: 11 violations on 7 screens. Fixed in Phase 8:**

| Finding                                                                                                             | Fix                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `aria-selected` on radio chips (Documents, Activity, signing options, signature pickers)                            | Radios expose `aria-checked` only                                                                         |
| `aria-selected` on toggle buttons (editor tools) and page-jump buttons                                              | Tools use `aria-pressed`; page jump is a radio with `aria-checked`                                        |
| `aria-checked` on the switch's inner element, with no role (settings)                                               | Removed. The Switch exposes its own state, and the whole row toggles                                      |
| Page dots labelled without a role (onboarding)                                                                      | `progressbar` with value and text                                                                         |
| Scroll areas with only text that a keyboard can't reach (onboarding pager, sheets)                                  | `tabIndex={0}`                                                                                            |
| Text at 3.2:1 contrast (disabled setting titles, disclosure version, inbox times, participants, editor save status) | Readable text uses `textSecondary` (≥ 4.5:1); `textTertiary` is for disabled and decorative elements only |
| Unnamed loading spinners                                                                                            | `accessibilityLabel="Loading"`                                                                            |
| Targets under 44 pt (Skip, search field, setting switches, recipient ⋯)                                             | Minimum sizes; switch rows are tappable                                                                   |

**Now:** 0 violations on all 17 screens. One small target remains: the navigation header's back
button on **web** (30×30). It comes from react-navigation's web header; native builds use the system
back button.

## Manual: needs device builds ⏳

| Check                                                                                                                       | iOS | Android |
| --------------------------------------------------------------------------------------------------------------------------- | --- | ------- |
| VoiceOver / TalkBack complete sign-in, then open a request → consent → **Your fields** → Type signature → Finish (SPEC §16) | ⏳  | ⏳      |
| Every control has a spoken name and role; states (on/off, selected, disabled) are announced                                 | ⏳  | ⏳      |
| Largest Dynamic Type / font scale: no clipped text on Home, Documents, details, signing, Account                            | ⏳  | ⏳      |
| Field reordering in the editor with buttons only (no drag)                                                                  | ⏳  | ⏳      |
| Biometric lock screen: focus moves to "Unlock"; nothing behind it is reachable                                              | ⏳  | ⏳      |
| Reduce Motion / Reduce Transparency respected                                                                               | ⏳  | ⏳      |
| Dark mode contrast spot-check (tokens are designed for ≥ 4.5:1 text)                                                        | ⏳  | ⏳      |
| Switch Control / keyboard (iPad, Android with keyboard) reaches every action                                                | ⏳  | ⏳      |

The Maestro flows in `e2e/maestro` use the same accessibility path as screen readers (the field list,
not taps inside the PDF), so a green Maestro run is partial evidence for the first row.
