/**
 * Regression check: the 3D model must stay visible however the customer switches sizes.
 *
 * useGLTF caches one scene per model; React Suspense hides on-screen objects while another
 * size loads, so a cached scene could come back invisible. This drives the real app in
 * headless Chrome, switches size and package rapidly in random order, and asserts that
 * exactly one tent is visible and the frame matches the package after every round.
 *
 *   npm run e2e        (uses the installed Google Chrome; starts its own dev server)
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failures = 0;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => {
    failures++;
    console.error('page error:', e.message);
  });
  await page.goto('http://localhost:5199/');
  await page.waitForFunction(() => window.__scene && window.__configurator, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const visible = () =>
    page.evaluate(() => {
      const out = { canopies: new Set(), frameMeshes: 0 };
      window.__scene.traverse((o) => {
        if (!o.isMesh) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        const role = o.material?.userData?.role;
        if (role === 'print') out.canopies.add(o.uuid);
        if (role === 'frame') out.frameMeshes++;
      });
      return { canopies: out.canopies.size, frameMeshes: out.frameMeshes, size: window.__configurator.store.getState().design.options.size };
    });

  for (let round = 0; round < 12; round++) {
    const sizes = ['6.5x6.5', '5x5', '8x8', '5x5', '6.5x6.5'].sort(() => Math.random() - 0.5);
    for (const size of sizes) {
      await page.evaluate((s) => window.__configurator.store.getState().setOption('size', s), size);
      await page.waitForTimeout(Math.random() * 120);
    }
    const pkg = round % 3 === 0 ? 'canopy-only' : 'canopy-frame';
    await page.evaluate((p) => window.__configurator.store.getState().setOption('package', p), pkg);
    await page.waitForTimeout(1200);
    const v = await visible();
    const ok = v.canopies === 1 && (pkg === 'canopy-only' ? v.frameMeshes === 0 : v.frameMeshes > 0);
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} round ${round + 1}: ${v.size} ${pkg} -> ${v.canopies} canopy, ${v.frameMeshes} frame meshes`);
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('variant switching: all rounds passed');
