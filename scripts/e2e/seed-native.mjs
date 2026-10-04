/**
 * Seeds the local stack for the Maestro flows (e2e/maestro): a user with a document waiting for
 * their signature. Prints the values to pass to Maestro with -e.
 *
 *   node scripts/e2e/seed-native.mjs
 *   maestro test -e EMAIL=… -e PASSWORD=… -e DOC_TITLE=… e2e/maestro
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString(),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const email = `maestro.${stamp}@signflow.test`;
const password = 'Maestro-e2e-pass1';
const title = `Maestro lease ${String(stamp).slice(-5)}`;

await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Mia Maestro' },
});
const { data: auth } = await client.auth.signInWithPassword({ email, password });
const { data: doc } = await client
  .from('documents')
  .insert({ owner_id: auth.user.id, title })
  .select('id')
  .single();
await client.storage
  .from('documents')
  .upload(
    `${auth.user.id}/${doc.id}/original.pdf`,
    readFileSync(new URL('../../fixtures/pdf/portrait-3p.pdf', import.meta.url)),
    {
      contentType: 'application/pdf',
    },
  );
await client.functions.invoke('process-upload', { body: { document_id: doc.id } });
const { data: rec } = await client
  .from('document_recipients')
  .insert({ document_id: doc.id, name: 'Mia Maestro', email, role: 'signer', signing_order: 1 })
  .select('id')
  .single();
await client.rpc('save_document_fields', {
  p_document_id: doc.id,
  p_fields: [
    {
      id: crypto.randomUUID(),
      recipient_id: rec.id,
      page_number: 1,
      type: 'signature',
      x: 0.1,
      y: 0.7,
      width: 0.3,
      height: 0.06,
      required: true,
      properties: {},
    },
  ],
});
const sent = await client.functions.invoke('send-document', { body: { document_id: doc.id } });
if (sent.error) throw sent.error;
console.log(`-e EMAIL=${email} -e PASSWORD=${password} -e "DOC_TITLE=${title}"`);
