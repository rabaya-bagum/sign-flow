import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { HttpError } from '../_shared/http.ts';
import { createUser, localStatus } from '../_shared/test/harness.ts';
import { DevStampInput, devStamp } from '../dev-stamp/logic.ts';
import { FIXTURES } from '../dev-stamp/fixtures.ts';
import { PDFDocument } from '../_shared/deps.ts';

const user = await createUser('dev-stamp');

function withDevTools<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = Deno.env.get('DEV_TOOLS');
  if (value === undefined) Deno.env.delete('DEV_TOOLS');
  else Deno.env.set('DEV_TOOLS', value);
  return fn().finally(() => {
    if (previous === undefined) Deno.env.delete('DEV_TOOLS');
    else Deno.env.set('DEV_TOOLS', previous);
  });
}

const onPublicHost = (url: string) => {
  const u = new URL(url);
  return `${localStatus().API_URL}${u.pathname}${u.search}`;
};

Deno.test('dev-stamp refuses unless DEV_TOOLS=true', async () => {
  const input = DevStampInput.parse({ fixture: 'portrait-3p' });
  for (const value of [undefined, 'false', '1', 'TRUE']) {
    await withDevTools(value, async () => {
      const error = await assertRejects(() => devStamp(input, user.ctx), HttpError);
      assertEquals(error.code, 'NOT_FOUND');
    });
  }
});

Deno.test('dev-stamp is not in the deploy list', async () => {
  const pkg = JSON.parse(await Deno.readTextFile(new URL('../../../package.json', import.meta.url)));
  const deploy: string = pkg.scripts['functions:deploy'];
  assert(!deploy.includes('dev-stamp'), deploy);
  // Every other function is deployed.
  for await (const entry of Deno.readDir(new URL('../', import.meta.url))) {
    if (
      !entry.isDirectory ||
      entry.name.startsWith('_') ||
      entry.name === 'tests' ||
      entry.name === 'dev-stamp'
    )
      continue;
    assert(deploy.split(' ').includes(entry.name), `${entry.name} missing from functions:deploy`);
  }
});

Deno.test('dev-stamp rejects unknown fixtures and pages', async () => {
  assert(!DevStampInput.safeParse({ fixture: '../../etc/passwd' }).success);
  await withDevTools('true', async () => {
    const input = DevStampInput.parse({
      fixture: 'a6',
      boxes: [{ page: 2, kind: 'rect', rect: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } }],
    });
    const error = await assertRejects(() => devStamp(input, user.ctx), HttpError);
    assertEquals(error.code, 'INVALID_INPUT');
  });
});

Deno.test('dev-stamp serves the fixture, then the stamped copy, under the caller folder', async () => {
  await withDevTools('true', async () => {
    const original = await devStamp(DevStampInput.parse({ fixture: 'rotated-270-offset' }), user.ctx);
    assertEquals(original.pages, [
      { page_number: 1, width_pt: 700, height_pt: 500, box_x_pt: 50, box_y_pt: 40, rotation: 270 },
    ]);
    assert(original.url.includes(`/documents/${user.id}/dev-spike/rotated-270-offset.pdf`));
    const res = await fetch(onPublicHost(original.url));
    assertEquals(res.status, 200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assertEquals(
      bytes,
      Uint8Array.from(atob(FIXTURES['rotated-270-offset']!), (c) => c.charCodeAt(0)),
    );

    const stamped = await devStamp(
      DevStampInput.parse({
        fixture: 'rotated-270-offset',
        boxes: [
          { page: 1, kind: 'rect', rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 } },
          { page: 1, kind: 'image', rect: { x: 0.5, y: 0.5, width: 0.3, height: 0.2 } },
        ],
      }),
      user.ctx,
    );
    assert(stamped.url.includes('rotated-270-offset.stamped.pdf'));
    const doc = await PDFDocument.load(
      new Uint8Array(await (await fetch(onPublicHost(stamped.url))).arrayBuffer()),
    );
    assertEquals(doc.getPageCount(), 1);
    assert(doc.getPage(0).node.Resources()?.toString().includes('/XObject'), 'image embedded');
  });
});
