/**
 * Build check: dev-only screens (app/dev/*) must not ship in production bundles (Phase 3 §G).
 *
 *   npm run check:dev-routes
 *
 * Exports production bundles (web and Android) and fails if text unique to a dev screen is present.
 * The routes themselves stay registered (Expo Router's file list) but render a redirect, and the
 * root layout's `Stack.Protected guard={__DEV__}` hides them.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Strings that exist only in dev screens (src/features/dev). Update when those screens change.
const MARKERS = {
  'src/features/dev/CoordinateSpikeScreen.tsx': 'Is functions:serve running with DEV_TOOLS=true?',
  'src/features/dev/ComponentGallery.tsx': 'Body copy explains what to do next.',
};
for (const [file, marker] of Object.entries(MARKERS)) {
  if (!readFileSync(file, 'utf8').includes(marker))
    throw new Error(`Marker for ${file} is stale: "${marker}"`);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const platforms = process.argv.includes('--web-only') ? ['web'] : ['web', 'android'];
const out = mkdtempSync(join(tmpdir(), 'signflow-export-'));
let failed = false;
try {
  for (const platform of platforms) {
    const dir = join(out, platform);
    execFileSync('npx', ['expo', 'export', '--platform', platform, '--output-dir', dir], {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, CI: '1', NODE_ENV: 'production' },
    });
    const bundles = files(dir).filter((f) => /\.(js|hbc|html)$/.test(f));
    for (const [file, marker] of Object.entries(MARKERS)) {
      const hit = bundles.find((b) => readFileSync(b).includes(marker));
      if (hit) {
        failed = true;
        console.error(`✗ ${platform}: ${file} is in the production bundle (${hit})`);
      }
    }
    if (!failed) console.log(`✓ ${platform}: no dev screens in ${bundles.length} production files`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
