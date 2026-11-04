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

// picker: filters, blind box, result
await p.click('#pickBtn'); await p.waitForSelector('.chips[data-k="n"]');
await p.click('.chips[data-k="n"] button[data-v="1"]');
await p.click('.chips[data-k="weight"] button[data-v="heavy"]');
await p.screenshot({ path: 'shots/tools_picker_form.png' });
await p.click('#pGo'); await wait(900);
await p.screenshot({ path: 'shots/tools_picker_shuffle.png' });
await p.waitForSelector('.res', { timeout: 10000 }); await wait(1200);
const G = await (await fetch(base + 'games.json')).json();
const winName = await p.textContent('.res h3'); const win = G.find(g => g.zh === winName);
eq('1 player + heavy: winner seats 1 and is heavy', [win.players[0] === 1, win.weight >= 3.4], [true, true]);
const sc = +(await p.textContent('#pScore'));
eq('score shown 50-99', sc > 50 && sc < 100, true);
eq('ranking lists 6 others, highest first', await p.$$eval('.rank s', l => { const v = l.map(x => +x.textContent); return v.length === 6 && v.every((x, i) => !i || x <= v[i - 1] + 3); }), true);
await p.screenshot({ path: 'shots/tools_picker_result.png' });
// random
await p.click('#pBack'); await p.click('#pRnd'); await p.waitForSelector('.res', { timeout: 10000 });
eq('random shows label instead of score', await p.textContent('.res .score span'), '随机抽中');
// AI (mocked endpoint)
await p.route('**/api/pick', r => r.fulfill({ json: { pick: 'tl', scores: { pgh: 40, bham: 42, odin: 30, tl: 91 }, reason: '想要勾心斗角的推理，一人当剧作家对抗大家' } }));
await p.click('#pBack'); await p.click('.tabs button[data-t="ai"]');
await p.fill('#pTxt', '想要互相推理、勾心斗角的'); await p.click('#pAsk');
await p.waitForSelector('.res', { timeout: 10000 }); await wait(1100);
eq('AI pick revealed', [await p.textContent('.res h3'), await p.textContent('#pScore'), (await p.textContent('.res .why')).includes('剧作家')], ['惨剧轮回', '91', true]);
await p.screenshot({ path: 'shots/tools_picker_ai.png' });
await p.click('#pEnter'); await p.waitForURL('https://tl.leisurecat.cloud/', { timeout: 6000 }).catch(() => {});
eq('enter from picker goes to the helper', p.url(), 'https://tl.leisurecat.cloud/');
await p.goBack(); await p.waitForSelector('.box', { state: 'attached' }); await wait(600);

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
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.slice(0, 2) });
await wait(300);
eq('2 of 3 fingers', [await p.$$eval('.fring', l => l.length), (await p.textContent('.fz-msg')).includes('2 / 3')], [2, true]);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
await wait(800); await p.screenshot({ path: 'shots/tools_finger_hold.png' });
await wait(1300); await p.screenshot({ path: 'shots/tools_finger_spin.png' });
await wait(2600);
eq('every finger got a number', await p.$$eval('.fring .num.on', l => l.map(x => x.textContent).sort()), ['1', '2', '3']);
eq('one first player', await p.$$eval('.fring.first', l => l.length), 1);
await p.screenshot({ path: 'shots/tools_finger_done.png' });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await wait(700);
eq('result stays after lifting', await p.$$eval('.fring .num.on', l => l.length), 3);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] }); await wait(300);
eq('new round clears old rings', await p.$$eval('.fring', l => l.length), 1);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
eq('no page errors', errs, []);
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS');
