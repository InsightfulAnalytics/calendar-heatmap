// npm run look -- [--page "<page tab name>"] [--out <file.png>] [--wait <seconds>]
//
// Connects through the debugging port, selects a page by its tab (when given), waits until every
// visual on it has stopped changing, then screenshots the report view and prints each visual
// container's accessible name with a short account of what it shows: a Deneb visual's drawn mark
// count, or a native visual's text. For looking at a page after an edit, beside the seam's
// all-pages screenshot, whose first page is often captured before it has drawn.
import { parseArgs } from 'node:util';
import { connectDesktop } from '../desktop.ts';

const { values } = parseArgs({
  options: {
    page: { type: 'string' },
    out: { type: 'string' },
    wait: { type: 'string', default: '6' },
  },
});

const desktop = await connectDesktop();
const page = desktop.page;
try {
  if (values.page) {
    const tab = page.locator(`[role=tab]`).filter({ hasText: values.page }).first();
    await tab.click();
  }
  await desktop.waitForCanvas();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await sleep(Number(values.wait) * 1000);
  const readVisuals = async () => {
    const out: string[] = [];
    for (const v of await page.locator('.visualContainer').all()) {
      const label = ((await v.getAttribute('aria-label')) ?? '').trim();
      const frames = v.locator('iframe');
      if (await frames.count()) {
        const frame = await (await frames.first().elementHandle())?.contentFrame();
        const marks = frame ? await frame.evaluate(() => {
          const svg = document.querySelector('svg.marks');
          const err = document.body.innerText.trim().slice(0, 160);
          return svg ? `svg with ${svg.querySelectorAll('path,text,rect').length} elements` : `no svg; text: ${err}`;
        }).catch((e) => `unreadable: ${e}`) : 'no frame';
        out.push(`[deneb] ${label}: ${marks}`);
      } else {
        const text = ((await v.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
        out.push(`${label}: ${text}`);
      }
    }
    return out;
  };
  let last = '';
  for (let i = 0; i < 10; i++) {
    const now = (await readVisuals()).join('\n');
    if (now === last) break;
    last = now;
    await sleep(2000);
  }
  console.log(last);
  if (values.out) console.log('screenshot', await desktop.screenshot(values.out));
} finally {
  await desktop.disconnect();
}
