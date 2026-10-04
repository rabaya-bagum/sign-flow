import { contrastRatio } from '../contrast';
import { DISPLAY_STATUSES, statusPresentation } from '../status';
import { palette, type ColorScheme } from '../tokens';

const AA_TEXT = 4.5;
const AA_LARGE_OR_UI = 3;

describe('contrastRatio', () => {
  it('matches known reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe.each(['light', 'dark'] as ColorScheme[])('%s tokens meet WCAG AA', (scheme) => {
  const c = palette[scheme];
  const surfaces = { background: c.background, surface: c.surface, surfaceElevated: c.surfaceElevated };

  it.each(Object.entries(surfaces))('body text on %s', (_name, bg) => {
    expect(contrastRatio(c.textPrimary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.textSecondary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.primary, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  // Tertiary text is reserved for non-essential metadata and placeholders, so it needs 3:1.
  it('tertiary text on background', () => {
    expect(contrastRatio(c.textTertiary, c.background)).toBeGreaterThanOrEqual(AA_LARGE_OR_UI);
  });

  it('text on primary buttons', () => {
    expect(contrastRatio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.onPrimary, c.primaryPressed)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('danger text on background (destructive buttons and errors)', () => {
    expect(contrastRatio(c.danger, c.background)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(DISPLAY_STATUSES)('status badge "%s"', (status) => {
    const p = statusPresentation(status, c);
    expect(contrastRatio(p.foreground, p.background)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('recipient colours', () => {
  const { recipientColors, palette } = jest.requireActual<typeof import('../tokens')>('../tokens');
  it.each(recipientColors)('%s: white text ≥ 4.5:1, border ≥ 3:1 on both backgrounds', (color) => {
    expect(contrastRatio(color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color, palette.light.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color, palette.dark.background)).toBeGreaterThanOrEqual(3);
  });
});
