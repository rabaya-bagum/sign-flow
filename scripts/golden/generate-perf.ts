/** Writes .golden/heavy-200.pdf: 200 pages, one distinct ~115 KB image each (~22 MB). */
import { imageHeavyPdf } from '../../supabase/functions/_shared/test/fixtures.ts';

const bytes = await imageHeavyPdf(200, 196);
await Deno.mkdir(new URL('../../.golden/', import.meta.url), { recursive: true });
await Deno.writeFile(new URL('../../.golden/heavy-200.pdf', import.meta.url), bytes);
console.log(`wrote .golden/heavy-200.pdf (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
