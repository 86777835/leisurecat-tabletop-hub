import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const LINKED = JSON.parse(readFileSync(new URL('../public/games.json', import.meta.url))).filter(g => g.url).length;
const base = 'http://localhost:8811/';
const shots = '/tmp/claude-501/codex_tasks/shots/';
await mkdir(shots,{recursive:true});
const browser = await chromium.launch({channel:'chrome'});
try {
for(const width of (process.argv[2] ? [Number(process.argv[2])] : [390,320])) {
 const ctx=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage(); const requests=[], errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('/api/ask')) requests.push(r.postDataJSON());});
 await page.route('https://*.leisurecat.cloud/**',r=>r.abort());
 await page.goto(base);await page.waitForSelector('.cfab');
 await page.screenshot({path:shots+`ask_entry_${width}.png`});
 const fab=await page.locator('.cfab').boundingBox();
 for(const sel of ['#zh','#rate','.hint']) { const r=await page.locator(sel).boundingBox();assert.ok(fab.x>=r.x+r.width||fab.x+fab.width<=r.x||fab.y>=r.y+r.height||fab.y+fab.height<=r.y,`${width} overlap ${sel}`); }
 await page.click('.cfab');
 assert.equal(await page.locator('.csug button').count(),4);
 await page.screenshot({path:shots+`ask_welcome_${width}.png`});
 const ask=async q=>{await page.fill('.cin textarea',q);await page.click('.cin button');};
 const done=async()=>{await page.waitForFunction(()=>!document.querySelector('.cin button').disabled);};
 await ask('怎么计分');
 assert.equal(await page.locator('.cchoices button').count(),LINKED);
 assert.equal(await page.locator('.cchoices [aria-pressed=true]').getAttribute('data-game'),'pgh');
 await ask('工业革命运河时代怎么结束');
 assert.deepEqual(await page.locator('.cchoices button').evaluateAll(es=>es.map(e=>e.dataset.game)),['pgh','bham']);
 assert.equal(await page.locator('.cchoices [aria-pressed=true]').getAttribute('data-game'),'pgh');
 assert.equal(requests.length,0);
 await page.screenshot({path:shots+`ask_ambiguous_${width}.png`});
 await page.click('[data-game=bham]'); await done();
 await ask('那下一轮呢');await done();assert.equal(requests.at(-1).game,'bham');assert.equal(requests.at(-1).messages.length,3);
 await ask('梅林能看见谁');await done();assert.equal(requests.at(-1).game,'avalon');assert.equal(requests.at(-1).messages.length,1);
 assert.match(await page.locator('.cswitch').last().textContent(),/阿瓦隆/);
 assert.equal(await page.locator('.cgame').last().textContent(),'阿瓦隆');
 assert.equal(await page.locator('.cm.a a').last().getAttribute('href'),'https://avalon.leisurecat.cloud');
 await page.screenshot({path:shots+`ask_direct_${width}.png`});
 await ask('沙虫怎么用');await done();assert.match(await page.locator('.cm.a a').last().getAttribute('href'),/v=uprising/);
 await ask('匹兹堡 mockreset'); await done();assert.ok(!(await page.locator('.canswer').last().textContent()).includes('这段旧回答必须消失'));assert.ok(!(await page.locator('.clog').textContent()).includes('mock-model-hidden'));
 await ask('匹兹堡 mockweb'); await done();
 assert.equal(await page.locator('.canswer').last().locator('.cweb').count(),1);
 assert.deepEqual(await page.locator('.canswer').last().locator('.csrc a').evaluateAll(es=>es.map(e=>[e.textContent,e.getAttribute('href'),e.target])),[['[1] Rules thread <b>BoardGameGeek','https://boardgamegeek.com/thread/1','_blank']]);
 await page.screenshot({path:shots+`ask_web_${width}.png`});
 for(const [q,match] of [['mock429',/429/],['mock503',/503/],['mockerror',/模拟流内错误/],['mockdrop',/网络连接中断/]]) {await ask(q);await done();assert.match(await page.locator('.canswer').last().textContent(),match);}
 const before=requests.length;await ask('展翅翱翔怎么玩');assert.equal(requests.length,before);assert.equal(await page.locator('.cm').last().textContent(),'这款还没有收录规则资料');
 await page.screenshot({path:shots+`ask_unavailable_${width}.png`});
 await page.route('**/api/ask',r=>r.abort('internetdisconnected'));await ask('匹兹堡断网');await done();assert.match(await page.locator('.canswer').last().textContent(),/网络连接失败/);await page.unroute('**/api/ask');
 if(width===390){await ask('匹兹堡 mocktimeout');await page.waitForFunction(()=>!document.querySelector('.cin button').disabled,{},{timeout:35000});assert.match(await page.locator('.canswer').last().textContent(),/30 秒/);}
 assert.ok(await page.locator('.cpanel').evaluate(e=>e.scrollWidth<=e.clientWidth));
 await page.click('.cx'); const old=await page.textContent('#zh');
 const swipeY=page.viewportSize().height*.45;
 await page.mouse.move(width*.8,swipeY);await page.mouse.down();await page.mouse.move(width*.2,swipeY,{steps:12});await page.mouse.up();await page.waitForTimeout(1200);assert.notEqual(await page.textContent('#zh'),old);
 await page.click('#pickBtn');await page.waitForSelector('.sheet');await page.click('.sheet .sh-x');await page.waitForTimeout(400);
 await page.click('#orderBtn');await page.waitForSelector('.sheet');await page.click('.sheet .sh-x');
 assert.deepEqual(errors,[]);await ctx.close();console.log(`PASS UI ${width}px：候选默认、追问、切换、流式、错误、断网、未收录、转盘与工具`);
}
} finally { await browser.close(); }
