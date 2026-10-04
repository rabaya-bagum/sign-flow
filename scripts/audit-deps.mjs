/**
 * Dependency audit for CI (SPEC §14). Fails on any high or critical advisory in production
 * dependencies unless it is in security/audit-allowlist.json with an unexpired review date.
 *
 *   npm run audit:deps
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const allow = JSON.parse(readFileSync(new URL('../security/audit-allowlist.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const accepted = new Map(allow.advisories.map((a) => [a.id, a]));

let report;
try {
  report = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  report = error.stdout;
}
const { vulnerabilities = {} } = JSON.parse(report);

const problems = [];
const seen = new Set();
for (const [name, v] of Object.entries(vulnerabilities)) {
  for (const via of v.via) {
    if (typeof via !== 'object' || !['high', 'critical'].includes(via.severity)) continue;
    const id = via.url.split('/').pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = accepted.get(id);
    if (!entry) problems.push(`${via.severity}: ${name} ${id} ${via.title}`);
    else if (entry.reviewBy < today)
      problems.push(`allowlist entry expired (${entry.reviewBy}): ${name} ${id}`);
    else console.log(`accepted until ${entry.reviewBy}: ${name} ${id}`);
  }
}
for (const id of accepted.keys()) {
  if (!seen.has(id)) console.log(`no longer reported, remove from the allowlist: ${id}`);
}
if (problems.length) {
  console.error(`\n${problems.length} unaccepted advisories:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('dependency audit: ok');
