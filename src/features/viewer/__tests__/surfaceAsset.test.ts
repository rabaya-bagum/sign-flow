import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../../..');

describe('assets/pdf-surface/surface.html', () => {
  it('is up to date with web/pdf-surface (run `npm run build:surface`)', () => {
    expect(() =>
      execFileSync('node', ['scripts/build-surface.mjs', '--check'], { cwd: root, stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('is self-contained: no remote scripts, styles or fonts', () => {
    const html = readFileSync(join(root, 'assets/pdf-surface/surface.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).toMatch(/Content-Security-Policy/);
    expect(html).toContain("default-src 'none'");
  });
});
