import { formatBytes } from '../formatBytes';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [245760, '240 KB'],
    [25 * 1024 * 1024, '25 MB'],
    [null, '—'],
  ])('%s → %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});
