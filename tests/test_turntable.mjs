// Turntable: three shelves (德式 / 推理阵营 / 其他). Swipe left/right turns the table, up/down changes shelf (both loop);
// arrow keys, the shelf rail, tapping a side box, wrap-around, neighbour overlap, remembering the last game,
// entering a game and the back button. Phone and desktop sizes.
// Usage: node tests/test_turntable.mjs http://localhost:8811/   (also safe against the live site: it writes nothing)
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:8811/';
const b = await chromium.launch({ channel: 'chrome' });
let fails = 0; const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); };
const SHELVES = ['德式', '推理阵营', '其他'];
for (const [n, o] of [['m', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['d', { viewport: { width: 1280, height: 800 } }]]) {
  const ctx = await b.newContext(o); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://*.leisurecat.cloud/**', r => r.request().isNavigationRequest() && !r.request().url().startsWith(base) ? r.fulfill({ body: '<title>game</title>arrived', contentType: 'text/html' }) : r.continue());
  await p.goto(base); await p.waitForLoadState('networkidle'); await p.waitForTimeout(700);
  const title = () => p.textContent('#zh');
  const on = () => p.textContent('.shelves button.on');
  const helpers = await p.evaluate(async () => (await (await fetch('games.json')).json()).filter(g => g.url));
  const byShelf = SHELVES.map(s => helpers.filter(g => g.shelf === s));
  eq(n + ' every helper site is on a shelf', byShelf.flat().length, helpers.length);
  eq(n + ' shelf rail', await p.$$eval('.shelves button', l => l.map(x => x.textContent)), SHELVES);
  eq(n + ' starts on 德式, first game', [await on(), await title(), await p.locator('.box').count()], ['德式', '工业革命：匹兹堡', byShelf[0].length]);
  await p.screenshot({ path: `shots/shelf_${n}_0.png` });

  const cw = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hmax')));
  const y = o.viewport.height * .45, x0 = o.viewport.width / 2;
  const swipe = async (dx, dy) => {
    await p.mouse.move(x0, y); await p.mouse.down();
    for (let s = 1; s <= 12; s++) { await p.mouse.move(x0 + dx * s / 12, y + dy * s / 12); await p.waitForTimeout(16); }
    await p.mouse.up(); await p.waitForTimeout(1200);
  };
  // swipe left by one card
  await swipe(-cw * .6, 0);
  eq(n + ' swipe left → next game', await title(), '工业革命：伯明翰');
  if (n === 'd') { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(1200); eq('d arrow key → next', await title(), '阿纳克遗迹'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(1200); }
  // tap the visible part of the right-hand cover
  const right = await p.$eval('.box[data-i="2"] .front', c => { const r = c.getBoundingClientRect(); return [(Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2, r.y + r.height / 2]; });
  await p.mouse.click(right[0], right[1]); await p.waitForTimeout(1300);
  eq(n + ' tap side cover → it turns to front', await title(), '阿纳克遗迹');
  // a short vertical wiggle does not change shelf
  await swipe(0, -20);
  eq(n + ' small vertical move keeps the shelf', [await on(), await title()], ['德式', '阿纳克遗迹']);

  // every shelf: wrap around and neighbour spacing
  for (const [s, games] of byShelf.entries()) {
    if (s > 0) {
      if (n === 'm') await swipe(0, -200); else await p.keyboard.press('ArrowDown');
      await p.waitForTimeout(400);
      eq(`${n} → shelf ${SHELVES[s]}`, [await on(), await title(), await p.locator('.box').count()], [SHELVES[s], games[0].zh, games.length]);
      await p.screenshot({ path: `shots/shelf_${n}_${s}.png` });
    } else { // back to the first game of the shelf
      while ((await title()) !== games[0].zh) { await p.evaluate(() => document.getElementById('next').click()); await p.waitForTimeout(900); }
    }
    for (const [i, game] of games.entries()) {
      await p.waitForTimeout(1200);
      eq(`${n} ${game.key} centred`, await title(), game.zh);
      if (games.length > 1) {
        const metrics = await p.evaluate(i => {
          const boxes = [...document.querySelectorAll('.box')];
          const front = boxes[i].querySelector('.front').getBoundingClientRect();
          return [(i + boxes.length - 1) % boxes.length, (i + 1) % boxes.length].map(j => {
            const faces = [...boxes[j].querySelectorAll('.f')].map(f => f.getBoundingClientRect());
            const r = faces[0];
            const left = Math.min(...faces.map(f => f.left)), right = Math.max(...faces.map(f => f.right));
            return {
              overlap: Math.max(0, ...faces.map(f => Math.min(front.right, f.right) - Math.max(front.left, f.left))),
              frontVisible: Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)),
              frontWidth: r.width,   // a small box (7连翻) is narrower than 50px even when wholly on screen
              clipped: Math.max(0, -left) + Math.max(0, right - innerWidth)
            };
          });
        }, i);
        const overlap = Math.max(...metrics.map(m => m.overlap)), visible = Math.min(...metrics.map(m => m.frontVisible)), clipped = Math.max(...metrics.map(m => m.clipped));
        console.log(`SPREAD ${n} ${game.key}: max overlap=${overlap.toFixed(2)}px, min front visible=${visible.toFixed(2)}px, max clipped=${clipped.toFixed(2)}px`);
        eq(`${n} ${game.key} neighbour overlap <= 4px`, overlap <= 4, true);
        if (n === 'm') eq(`${n} ${game.key} neighbour front visible >= 50px (or all of it)`, metrics.every(m => m.frontVisible >= Math.min(50, m.frontWidth - 0.5)), true);
        else eq(`${n} ${game.key} neighbours fully inside viewport`, clipped <= .01, true);
      }
      await p.evaluate(() => document.getElementById('next').click());
    }
    await p.waitForTimeout(1200);
    eq(`${n} ${SHELVES[s]} wraps around`, await title(), games[0].zh);
  }
  // shelves loop: up from the last shelf comes the first, down from the first comes the last
  if (n === 'm') await swipe(0, -200); else await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(900);   // a shelf change takes ~0.6 s; input during it is ignored
  eq(n + ' past 其他 loops to 德式', [await on(), await title()], ['德式', byShelf[0][0].zh]);
  if (n === 'm') await swipe(0, 200); else await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(900);   // a shelf change takes ~0.6 s; input during it is ignored
  eq(n + ' before 德式 loops to 其他', [await on(), await title()], ['其他', byShelf[2][0].zh]);
  if (n === 'm') await swipe(0, 200); else await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(900);   // a shelf change takes ~0.6 s; input during it is ignored
  eq(n + ' swipe down → previous shelf', [await on(), await title()], ['推理阵营', byShelf[1][0].zh]);
  await p.evaluate(() => document.getElementById('next').click()); await p.waitForTimeout(1200);
  eq(n + ' turned to the 2nd 推理阵营 game', await title(), byShelf[1][1].zh);
  // the hub remembers the last game, on its own shelf
  await p.reload(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800);
  eq(n + ' reload remembers shelf and game', [await on(), await title()], ['推理阵营', byShelf[1][1].zh]);
  await p.click('.shelves button:has-text("德式")'); await p.waitForTimeout(800);
  eq(n + ' rail tap → 德式', [await on(), await title()], ['德式', byShelf[0][0].zh]);
  await p.screenshot({ path: `shots/shelf_${n}_back.png` });

  // tap the front cover → zoom then navigate
  const front = await p.$$eval('.box', cs => { const c = cs.find(c => c.tabIndex === 0).querySelector('.front'); const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.click(front[0], front[1]); await p.waitForTimeout(380);
  await p.waitForURL('https://pgh.leisurecat.cloud/', { timeout: 5000 }).catch(() => {});
  eq(n + ' entered the game', p.url(), 'https://pgh.leisurecat.cloud/');
  await p.goBack(); await p.waitForTimeout(800);
  eq(n + ' back: hub usable again', [await p.$('.zoom'), await p.evaluate(() => document.body.classList.contains('going')), await title()], [null, false, '工业革命：匹兹堡']);
  eq(n + ' no page errors', errs, []);
  await ctx.close();
}
// a sister site's 写评价 link for a game on another shelf still opens its review form
{ const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await p.goto(base + '?rate=botc&back=' + encodeURIComponent('https://botc.leisurecat.cloud/'));
  await p.waitForSelector('#rvP', { timeout: 8000 }).catch(() => {});
  eq('rate link for a 推理阵营 game', await p.textContent('.sh-head h2').catch(() => ''), '血染钟楼 · 玩家评价'); }
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exitCode = fails ? 1 : 0;
