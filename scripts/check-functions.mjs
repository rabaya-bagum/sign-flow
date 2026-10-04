/**
 * Every Edge Function folder needs a deno.json mapping the bare imports used by shared code (zod).
 * The Deno tests use the root deno.json, so a missing one only shows up when the function boots
 * ("Relative import path "zod" not prefixed"). Run: npm run check:functions
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = new URL('../supabase/functions/', import.meta.url);
const zod = JSON.parse(readFileSync(new URL('../deno.json', import.meta.url), 'utf8')).imports?.zod;
const problems = [];
for (const name of readdirSync(root)) {
  if (name.startsWith('_') || name === 'tests' || !existsSync(new URL(`${name}/index.ts`, root))) continue;
  const config = new URL(`${name}/deno.json`, root);
  if (!existsSync(config)) {
    problems.push(`${name}: missing deno.json`);
    continue;
  }
  const mapped = JSON.parse(readFileSync(config, 'utf8')).imports?.zod;
  if (mapped !== zod) problems.push(`${name}: zod is ${mapped ?? 'unmapped'}, root deno.json has ${zod}`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('function configs: ok');
