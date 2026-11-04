// Turntable: swipe, arrow keys, tap a side box, wrap-around, enter a game, back button. Phone and desktop sizes.
// Usage: node tests/test_turntable.mjs http://localhost:8811/   (also safe against the live site: it writes nothing)
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:8811/';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0; const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); };
for (const [n, o] of [['m', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['d', { viewport: { width: 1280, height: 800 } }]]) {
  const ctx = await b.newContext(o); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://*.leisurecat.cloud/**', r => r.request().isNavigationRequest() && !r.request().url().startsWith(base) ? r.fulfill({ body: '<title>game</title>arrived', contentType: 'text/html' }) : r.continue());
  await p.goto(base); await p.waitForLoadState('networkidle'); await p.waitForTimeout(700);
  const title = () => p.textContent('#zh');
  eq(n + ' five boxes', await p.locator('.box').count(), 5);
  await p.screenshot({ path: `/tmp/claude-501/codex_tasks/shots/turntable_${n}.png` });
  eq(n + ' starts on first game', await title(), '工业革命：匹兹堡');
  await p.screenshot({ path: `shots/hub3_${n}_0.png` });
  // swipe left by one card
  const cw = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hmax')));
  const y = o.viewport.height * .45, x0 = o.viewport.width / 2;
  await p.mouse.move(x0 + cw * .5, y); await p.mouse.down();
  for (let s = 1; s <= 12; s++) { await p.mouse.move(x0 + cw * .5 - cw * .6 * s / 12, y); await p.waitForTimeout(16); }
  await p.waitForTimeout(250); await p.screenshot({ path: `shots/hub3_${n}_drag.png` });
  await p.mouse.up(); await p.waitForTimeout(1200);
  eq(n + ' swipe left → next game', await title(), '工业革命：伯明翰');
  // keyboard / side-card tap
  if (n === 'd') { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1200); eq('d arrow key → next', await title(), '奥丁的盛宴'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(1200); }
  // tap the visible part of the right-hand cover
  const right = await p.$eval('.box[data-i="2"] .front', c => { const r = c.getBoundingClientRect(); return [(Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2, r.y + r.height / 2]; });
  await p.mouse.click(right[0], right[1]); await p.waitForTimeout(1300);
  eq(n + ' tap side cover → it turns to front', await title(), '奥丁的盛宴');
  await p.screenshot({ path: `shots/hub3_${n}_odin.png` });
  // wrap around: 惨剧轮回 → 血染钟楼 → 匹兹堡
  for (let k = 0; k < 3; k++) { await p.evaluate(() => document.getElementById('next').click()); await p.waitForTimeout(900);
    if (k === 1) { eq(n + ' fifth game is botc', await title(), '血染钟楼'); await p.screenshot({ path: `/tmp/claude-501/codex_tasks/shots/turntable_${n}_botc.png` }); }
  }
  eq(n + ' wraps around', await title(), '工业革命：匹兹堡');
  // Measure every centred game after settling, including the cyclic first/last neighbours.
  const games = await p.evaluate(async () => (await (await fetch('games.json')).json()).filter(g => g.url));
  for (const [i, game] of games.entries()) {
    await p.waitForTimeout(1200);
    eq(`${n} ${game.key} centred`, await title(), game.zh);
    const metrics = await p.evaluate(i => {
      const boxes = [...document.querySelectorAll('.box')];
      const front = boxes[i].querySelector('.front').getBoundingClientRect();
      return [(i + boxes.length - 1) % boxes.length, (i + 1) % boxes.length].map(j => {
        // Include even back-facing faces: this conservatively bounds every visible face.
        const faces = [...boxes[j].querySelectorAll('.f')].map(f => f.getBoundingClientRect());
        const r = faces[0];
        const left = Math.min(...faces.map(f => f.left)), right = Math.max(...faces.map(f => f.right));
        return {
          overlap: Math.max(0, ...faces.map(f => Math.min(front.right, f.right) - Math.max(front.left, f.left))),
          frontVisible: Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)),
          clipped: Math.max(0, -left) + Math.max(0, right - innerWidth)
        };
      });
    }, i);
    const overlap = Math.max(...metrics.map(m => m.overlap));
    const visible = Math.min(...metrics.map(m => m.frontVisible));
    const clipped = Math.max(...metrics.map(m => m.clipped));
    console.log(`SPREAD ${n} ${game.key}: max overlap=${overlap.toFixed(2)}px, min front visible=${visible.toFixed(2)}px, max clipped=${clipped.toFixed(2)}px`);
    eq(`${n} ${game.key} neighbour overlap <= 4px`, overlap <= 4, true);
    if (n === 'm') eq(`${n} ${game.key} neighbour front visible >= 50px`, visible >= 50, true);
    else eq(`${n} ${game.key} neighbours fully inside viewport`, clipped <= .01, true);
    await p.screenshot({ path: `/tmp/claude-501/codex_tasks/shots/spread_${n}_${game.key}.png` });
    await p.evaluate(() => document.getElementById('next').click());
  }
  await p.waitForTimeout(1200);
  eq(n + ' measurement loop returns to first game', await title(), games[0].zh);
  // tap the front cover → zoom then navigate
  const front = await p.$$eval('.box', cs => { const c = cs.find(c => c.tabIndex === 0).querySelector('.front'); const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.click(front[0], front[1]); await p.waitForTimeout(380);
  await p.screenshot({ path: `shots/hub3_${n}_enter.png` });
  await p.waitForURL('https://pgh.leisurecat.cloud/', { timeout: 5000 }).catch(() => {});
  eq(n + ' entered the game', p.url(), 'https://pgh.leisurecat.cloud/');
  await p.goBack(); await p.waitForTimeout(800);
  eq(n + ' back: hub usable again', [await p.$('.zoom'), await p.evaluate(() => document.body.classList.contains('going')), await title()], [null, false, '工业革命：匹兹堡']);
  eq(n + ' no page errors', errs, []);
  await ctx.close();
}
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exitCode = fails ? 1 : 0;
