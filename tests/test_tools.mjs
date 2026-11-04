// Homepage tools: ratings, 帮我选游戏 (filters / random / AI mocked), 定先后手 (bag draw, 3-finger chooser via CDP touch).
// Usage: node tests/test_tools.mjs http://localhost:8811/   — local `wrangler dev --port 8811` only: it writes two test reviews.
import { chromium } from 'playwright-core';
const base = process.argv[2] || 'http://localhost:8811/';
if (!/localhost|127\.0\.0\.1/.test(base)) { console.log('only run this against local wrangler dev: it posts test reviews'); process.exit(1); }
for (const r of [{ name: '老张', stars: 3, text: '改个分' }, { name: '小李', stars: 4, text: '计分好用' }])
  await fetch(base + 'api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: 'pgh', room: 'AB12', ...r }) });
let fails = 0; const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route(u => !u.href.startsWith(base) && u.hostname.endsWith('leisurecat.cloud'), r => r.fulfill({ body: 'arrived', contentType: 'text/html' }));
await p.addInitScript(() => { if (!sessionStorage.getItem('init')) { localStorage.clear(); sessionStorage.setItem('init', 1); } });
await p.goto(base); await p.waitForSelector('.box', { state: 'attached' }); await wait(800);

// ratings under the caption
eq('rating shown for pgh', (await p.textContent('#rate')).replace(/\s+/g, ' '), '★ 3.52 条评价');
await p.click('#rate'); await p.waitForSelector('.rv-item');
eq('reviews list', await p.$$eval('.rv-item b', l => l.map(x => x.textContent).sort()), ['小李', '老张']);
await p.screenshot({ path: 'shots/tools_reviews.png' });
await p.click('.sheet .sh-x'); await wait(400);

// picker: hard player filter, sorted list and exclusive expansion
const G = await (await fetch(base + 'games.json')).json();
await p.click('#pickBtn'); await p.waitForSelector('.chips[data-k="n"]');
await p.click('.chips[data-k="n"] button[data-v="1"]');
await p.click('.chips[data-k="weight"] button[data-v="heavy"]');
await p.click('#pGo'); await p.waitForSelector('.pick-list');
const keys = await p.$$eval('.pick-main .pick-row', rows => rows.map(r => r.dataset.key));
eq('filter contains all and only games seating 1', keys.slice().sort(), G.filter(g => g.players[0] <= 1 && g.players[1] >= 1).map(g => g.key).sort());
eq('recommendation descending', await p.$$eval('.pick-main .pick-score b', l => { const v = l.map(x => +x.textContent); return v.every((x, i) => !i || x <= v[i - 1]); }), true);
eq('filter has no animation', await p.locator('.draw').count(), 0);
eq('excluded collapsed', await p.locator('.pick-excluded').getAttribute('open'), null);
await p.click('.pick-excluded summary');
eq('excluded games do not seat 1', await p.$$eval('.pick-excluded .pick-row', rows => rows.map(r => r.dataset.key).sort()), G.filter(g => g.players[0] > 1).map(g => g.key).sort());
await p.click('.pick-excluded summary');
await p.click('.pick-main .pick-row[data-key="odin"] .pick-toggle');
eq('helper entry visible', await p.locator('[data-enter="odin"]').isVisible(), true);
eq('no mobile horizontal overflow', await p.$eval('.sh-body', e => e.scrollWidth <= e.clientWidth), true);
await p.$eval('.sh-body', e => e.scrollTop = 0);
await p.screenshot({ path: 'shots/tools_picker_result.png' });
await p.screenshot({ path: '/tmp/claude-501/codex_tasks/shots/filter_mobile.png' });
await p.click('[data-enter="odin"]'); await p.waitForURL('https://odin.leisurecat.cloud/');
eq('filter entry navigates to helper', p.url(), 'https://odin.leisurecat.cloud/');
await p.goBack(); await p.waitForSelector('.box', { state: 'attached' }); await wait(600);
await p.click('#pickBtn');
await p.click('.chips[data-k="helper"] button[data-v="yes"]');
await p.click('#pGo');
eq('helper hard filter', await p.$$eval('.pick-main .pick-row', rows => rows.map(r => r.dataset.key).sort()), G.filter(g => g.url && g.players[0] <= 1).map(g => g.key).sort());
await p.click('#pBack'); await p.click('#pRnd');
await p.waitForSelector('.draw.shake');
eq('random still shuffles', await p.locator('.mbox').count() > 0, true);
await p.waitForSelector('.res', { timeout: 10000 });
const documentName = await p.textContent('.res h3');
eq('random respects hard filters', G.some(g => g.zh === documentName && g.url && g.players[0] <= 1), true);
eq('random shows label instead of score', await p.textContent('.res .score span'), '随机抽中');
// AI (mocked endpoint); pick deliberately has a lower score than pgh
await p.route('**/api/pick', async r => { await wait(400); await r.fulfill({ json: { pick: 'tl', scores: { pgh: 95, bham: 42, odin: 30, tl: 91 }, reason: '想要勾心斗角的推理，一人当剧作家对抗大家' } }); });
await p.click('#pBack'); await p.click('.tabs button[data-t="ai"]');
await p.fill('#pTxt', '想要互相推理、勾心斗角的'); await p.click('#pAsk');
eq('AI waiting button', [await p.textContent('#pAsk'), await p.locator('#pAsk').isDisabled()], ['AI 思考中…', true]);
await p.waitForSelector('.pick-list');
eq('AI pick first and expanded', [await p.locator('.pick-main .pick-row').first().getAttribute('data-key'), await p.locator('.pick-main .pick-toggle').first().getAttribute('aria-expanded')], ['tl', 'true']);
eq('AI remaining scores descending', await p.$$eval('.pick-main .pick-score b', l => { const v = l.slice(1).map(x => +x.textContent); return v.every((x, i) => !i || x <= v[i - 1]); }), true);
eq('AI reason at top', (await p.textContent('.pick-reason')).includes('剧作家'), true);
eq('AI no blind boxes', await p.locator('.draw').count(), 0);
await p.screenshot({ path: 'shots/tools_picker_ai.png' });
await p.screenshot({ path: '/tmp/claude-501/codex_tasks/shots/ai_mobile.png' });
await p.click('.pick-row[data-key="pgh"] .pick-toggle');
eq('only one expanded row', await p.locator('.pick-toggle[aria-expanded="true"]').count(), 1);
await p.click('#pBack');
await p.unroute('**/api/pick');
await p.route('**/api/pick', r => r.fulfill({ status: 503, json: { error: '测试：AI 暂不可用' } }));
await p.click('#pAsk'); await p.waitForSelector('.err');
eq('AI error shown', await p.textContent('.err'), '测试：AI 暂不可用');
await p.click('#pBack');
eq('AI error back to form', await p.locator('#pAsk').isEnabled(), true);
await p.click('.sheet .sh-x'); await wait(400);

// order: bag
await p.click('#orderBtn'); await p.waitForSelector('.tabs');
await p.click('.tabs button[data-t="bag"]'); await p.click('#oN button[data-n="4"]');
const ins = await p.$$('.names input');
const NAMES = ['老张', '小李', '阿美', '大刘'];
for (const [i, n] of NAMES.entries()) await ins[i].fill(n);
await p.click('#oDraw'); await wait(700 + 4 * 450 + 300);
const ord = await p.$$eval('#oOut div', l => l.map(x => x.childNodes[1].textContent));
eq('bag draws all 4 names once', [ord.length, ord.slice().sort().join()], [4, NAMES.slice().sort().join()]);
await p.screenshot({ path: 'shots/tools_bag.png' });

// order: finger chooser with 3 simulated fingers
await p.click('.tabs button[data-t="finger"]'); await p.click('#oN button[data-n="3"]'); await p.click('#oStart'); await p.waitForSelector('.fz');
const cdp = await ctx.newCDPSession(p);
const pts = [{ x: 90, y: 300, id: 1 }, { x: 290, y: 330, id: 2 }, { x: 190, y: 600, id: 3 }];
// Reconstruct the pseudo-element border-box centre, including pulse and parent scale.
const checkRingCentres = async state => {
  const metrics = await p.$$eval('.fring', (rings, points) => rings.map((el, i) => {
    const centre = r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    const r = el.getBoundingClientRect(), main = centre(r);
    const circle = centre(el.querySelector('circle').getBoundingClientRect());
    const style = getComputedStyle(el), before = getComputedStyle(el, '::before');
    const px = v => parseFloat(v);
    const w = px(before.width) + (before.boxSizing === 'border-box' ? 0 : px(before.paddingLeft) + px(before.paddingRight) + px(before.borderLeftWidth) + px(before.borderRightWidth));
    const h = px(before.height) + (before.boxSizing === 'border-box' ? 0 : px(before.paddingTop) + px(before.paddingBottom) + px(before.borderTopWidth) + px(before.borderBottomWidth));
    const [ox, oy] = before.transformOrigin.split(' ').map(px);
    const m = new DOMMatrix(before.transform === 'none' ? undefined : before.transform);
    const local = new DOMPoint(w / 2 - ox, h / 2 - oy).matrixTransform(m);
    const halo = {
      x: r.x + (px(style.borderLeftWidth) + px(before.left) + ox + local.x) * r.width / el.offsetWidth,
      y: r.y + (px(style.borderTopWidth) + px(before.top) + oy + local.y) * r.height / el.offsetHeight
    };
    const centres = [main, circle, halo];
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return { classes: el.className, pair: Math.max(distance(main, circle), distance(main, halo), distance(circle, halo)), finger: Math.max(...centres.map(c => distance(c, points[i]))) };
  }), pts);
  console.log('RING CENTRES', state, JSON.stringify(metrics));
  eq(`${state}: three rings measured`, metrics.length, 3);
  eq(`${state}: all circle centres within 1px`, metrics.every(m => m.pair <= 1 && m.finger <= 1), true);
};
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.slice(0, 2) });
await wait(300);
eq('2 of 3 fingers', [await p.$$eval('.fring', l => l.length), (await p.textContent('.fz-msg')).includes('2 / 3')], [2, true]);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
await wait(800);
await checkRingCentres('hold');
eq('hold progress is partial', await p.$$eval('.fring', rings => rings.every(el => { const v = +el.style.getPropertyValue('--p'); return v > 0 && v < 1; })), true);
await p.screenshot({ path: 'shots/tools_finger_hold.png' });
await p.screenshot({ path: '/tmp/claude-501/codex_tasks/shots/fring_hold.png' });
await p.screenshot({ path: '/tmp/claude-501/codex_tasks/shots/fring_zoom.png', clip: { x: pts[2].x - 100, y: pts[2].y - 100, width: 200, height: 200 } });
await p.waitForSelector('.fring.hl');
await checkRingCentres('highlight');
await p.screenshot({ path: 'shots/tools_finger_spin.png' });
await wait(2600);
eq('every finger got a number', await p.$$eval('.fring .num.on', l => l.map(x => x.textContent).sort()), ['1', '2', '3']);
eq('one first player', await p.$$eval('.fring.first', l => l.length), 1);
await checkRingCentres('done');
await p.screenshot({ path: 'shots/tools_finger_done.png' });
await p.screenshot({ path: '/tmp/claude-501/codex_tasks/shots/fring_done.png' });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await wait(700);
eq('result stays after lifting', await p.$$eval('.fring .num.on', l => l.length), 3);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] }); await wait(300);
eq('new round clears old rings', await p.$$eval('.fring', l => l.length), 1);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
eq('no page errors', errs, []);
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exitCode = fails ? 1 : 0;
