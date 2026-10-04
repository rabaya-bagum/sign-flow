import { relativeTime } from '../relativeTime';

const now = new Date(2026, 9, 3, 15, 0, 0); // Oct 3 2026, 15:00 local

describe('relativeTime', () => {
  it('returns justNow under a minute', () => {
    expect(relativeTime(new Date(now.getTime() - 30_000), now)).toEqual({ kind: 'justNow' });
  });

  it('returns minutes under an hour', () => {
    expect(relativeTime(new Date(now.getTime() - 5 * 60_000), now)).toEqual({ kind: 'minutes', count: 5 });
  });

  it('returns hours for earlier today', () => {
    expect(relativeTime(new Date(2026, 9, 3, 9, 30), now)).toEqual({ kind: 'hours', count: 5 });
  });

  it('returns yesterday by calendar day, even if under 24h', () => {
    expect(relativeTime(new Date(2026, 9, 2, 23, 0), now)).toEqual({ kind: 'yesterday' });
  });

  it('returns days within a week', () => {
    expect(relativeTime(new Date(2026, 8, 29, 12, 0), now)).toEqual({ kind: 'days', count: 4 });
  });

  it('returns the date after a week and accepts ISO strings', () => {
    const iso = new Date(2026, 8, 1).toISOString();
    expect(relativeTime(iso, now)).toEqual({ kind: 'date', date: new Date(iso) });
  });
});
