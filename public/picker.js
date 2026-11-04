// 帮我选游戏：按条件打推荐指数 / 随便来一个 / 问 AI，筛选和 AI 显示列表，随机用“抽盲盒”动画揭晓。
// 游戏库是 games.json；有 url 的游戏有助手，可以直接进入，其他的先看简介。
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const wait = ms => new Promise(r => setTimeout(r, ms));
export const cover = g => g.cover || `img/box-${g.key}.jpg`;
const span = ([a, b]) => a === b ? `${a}` : `${a}–${b}`;   // 120–120 → 120

const FILTERS = [
  { k: 'n', t: '几个人', opts: [['', '不限'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6+']] },
  { k: 'time', t: '想玩多久', opts: [['', '不限'], ['short', '1 小时内'], ['mid', '1–2 小时'], ['long', '2 小时以上']] },
  { k: 'weight', t: '难度', opts: [['', '不限'], ['light', '轻松'], ['medium', '适中'], ['heavy', '烧脑']] },
  { k: 'type', t: '类型', opts: [['', '不限'], ['德式', '德式'], ['美式', '美式'], ['合作', '合作'], ['推理', '推理 / 阵营'], ['聚会', '聚会 / 家庭']] },
  { k: 'helper', t: '范围', opts: [['', '全部游戏'], ['yes', '只看有助手的']] }
];
const TYPE_TAGS = { 德式: ['德式'], 美式: ['美式'], 合作: ['合作'], 推理: ['推理', '阵营'], 聚会: ['聚会', '家庭'] };
const TIME = { short: [0, 60], mid: [60, 120], long: [120, 600] };
const WEIGHT = { light: [1, 2.2], medium: [2.2, 3.4], heavy: [3.4, 5] };

// Recommendation index 0–100: start at 50, add for every wish that fits, subtract for misfits.
// A player count the game can't seat drops it below 20.
function score(g, f) {
  let s = 50, why = [];
  if (f.n) {
    const n = +f.n;
    const ok = n >= 6 ? g.players[1] >= 6 : n >= g.players[0] && n <= g.players[1];
    if (!ok) return { s: Math.min(15, 30 - Math.abs(n - g.players[1]) * 5), why: [`${g.players[0]}–${g.players[1]} 人，人数不合适`] };
    s += 18; why.push(`${n >= 6 ? '6 人以上' : n + ' 人'}能玩`);
    if (g.best?.includes(n)) { s += 6; why[why.length - 1] = `${n} 人最佳`; }
  }
  if (f.time) {
    const [a, b] = TIME[f.time], [x, y] = g.time, mid = (x + y) / 2;
    if (mid >= a && mid <= b) { s += 12; why.push(`约 ${x}–${y} 分钟`); }
    else if (y >= a && x <= b) s += 4;
    else s -= 14;
  }
  if (f.weight) {
    const [a, b] = WEIGHT[f.weight];
    if (g.weight >= a && g.weight <= b) { s += 12; why.push(`重度 ${g.weight}`); }
    else s -= Math.min(16, Math.round(Math.min(Math.abs(g.weight - a), Math.abs(g.weight - b)) * 12));
  }
  if (f.type) {
    if (TYPE_TAGS[f.type].some(t => g.tags.includes(t))) { s += 14; why.push(f.type === '推理' ? '推理 / 阵营' : f.type === '聚会' ? '聚会 / 家庭' : f.type); }
    else s -= 8;
  }
  return { s: Math.max(0, Math.min(99, Math.round(s + Math.random() * 3))), why };
}

export function open(GAMES, ratings, enterGame) {
  let tab = store.get('pick-tab', 'filter');
  const f = store.get('pick-f', {});
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sh-head"><h2>帮我选游戏</h2><button class="sh-x" aria-label="关闭">×</button></div>
    <div class="sh-body"><div class="sh-inner" id="pIn"></div></div>`;
  document.body.appendChild(sheet);
  const inner = sheet.querySelector('#pIn');
  let busy = false;
  const close = () => { sheet.classList.add('out'); setTimeout(() => sheet.remove(), 220); };
  sheet.querySelector('.sh-x').onclick = close;

  function form() {
    inner.innerHTML = `<div class="tabs"><button data-t="filter">按条件</button><button data-t="ai">问 AI</button></div><div id="pPane"></div>`;
    inner.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    inner.querySelector('.tabs').onclick = e => { if (e.target.dataset.t) { tab = e.target.dataset.t; store.set('pick-tab', tab); form(); } };
    const pane = inner.querySelector('#pPane');
    if (tab === 'filter') {
      pane.innerHTML = FILTERS.map(x => `<div class="grp"><b>${x.t}</b><div class="chips" data-k="${x.k}">${x.opts.map(([v, l]) => `<button data-v="${v}" class="${(f[x.k] || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`).join('')
        + `<div class="btn2"><button class="go-btn" id="pGo">筛选</button><button class="go-btn ghost" id="pRnd">随便来一个</button></div>
        <p class="note">按条件给游戏库里 ${GAMES.length} 款游戏打推荐指数，人数合适的按推荐指数排序。</p>`;
      pane.querySelectorAll('.chips').forEach(c => c.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        f[c.dataset.k] = b.dataset.v; store.set('pick-f', f);
        c.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      });
      pane.querySelector('#pGo').onclick = () => byFilter(false);
      pane.querySelector('#pRnd').onclick = () => byFilter(true);
    } else {
      const examples = ['4 个人，想玩两小时左右的重策略', '两个人，30 分钟轻松点的', '6 个朋友聚会，有新手', '想要互相推理、勾心斗角的'];
      pane.innerHTML = `<textarea class="ta" id="pTxt" maxlength="300" placeholder="说说这局的情况：几个人、想玩多久、有没有新手、喜欢什么类型……">${esc(store.get('pick-ai', ''))}</textarea>
        <div class="ex" style="margin:10px 0 4px">${examples.map(x => `<button>${x}</button>`).join('')}</div>
        <div class="btn2"><button class="go-btn" id="pAsk">让 AI 推荐</button></div><div id="pErr"></div>`;
      pane.querySelector('.ex').onclick = e => { const b = e.target.closest('button'); if (b) pane.querySelector('#pTxt').value = b.textContent; };
      pane.querySelector('#pAsk').onclick = () => byAI(pane.querySelector('#pTxt').value.trim());
    }
  }

  function pool() { return f.helper === 'yes' ? GAMES.filter(g => g.url) : GAMES; }

  function seats(g) { return !f.n || (+f.n >= 6 ? g.players[1] >= 6 : +f.n >= g.players[0] && +f.n <= g.players[1]); }

  function error(err) {
    inner.innerHTML = `<div class="err" role="alert">${esc(err.message === 'Failed to fetch' ? '网络连接失败，请稍后再试' : err.message)}</div><div class="btn2"><button class="go-btn ghost" id="pBack">返回</button></div>`;
    inner.querySelector('#pBack').onclick = form;
  }

  function list(ranked, excluded = [], reason = '', pick = '') {
    const summary = FILTERS.filter(x => f[x.k]).map(x => x.k === 'n' ? `${f.n === '6' ? '6+' : f.n} 人` : x.opts.find(([v]) => v === f[x.k])[1]).join(' · ') || '不限条件';
    const row = ({ g, s, why }) => {
      const rt = ratings[g.key];
      return `<article class="pick-row" data-key="${esc(g.key)}">
        <button class="pick-toggle" aria-expanded="${g.key === pick}" aria-controls="detail-${esc(g.key)}">
          <img class="pick-cover" src="${esc(cover(g))}" alt="">
          <span class="pick-info"><strong>${esc(g.zh)}</strong><small>${esc(g.en || '')}</small>
            <span class="pick-meta">${span(g.players)} 人 · ${span(g.time)} 分钟 · 重度 ${g.weight} · ${esc(g.tags.slice(0, 2).join(' · '))}</span>
            ${rt?.count ? `<span class="pick-rating">★ ${rt.avg} · ${rt.count} 条</span>` : ''}</span>
          <span class="pick-score"><b>${s}</b><small>推荐指数</small><i><u style="width:${Math.max(0, Math.min(100, s))}%"></u></i></span>
          <span class="pick-why">${esc(why.join(' · '))}</span>
        </button>
        <div class="pick-detail" id="detail-${esc(g.key)}" ${g.key === pick ? '' : 'hidden'}>
          <p>${esc(g.intro || '')}</p>
          ${g.expansions?.length ? `<p class="note">扩展：${g.expansions.map(x => esc(x.zh || x.en)).join('、')}</p>` : ''}
          <div class="btn2">${g.url ? `<button class="go-btn" data-enter="${esc(g.key)}">进入${esc(g.zh)}助手</button>` : '<button class="go-btn" disabled>这款还没有助手</button>'}</div>
        </div></article>`;
    };
    inner.innerHTML = `<div class="pick-list"><h3>${reason ? 'AI 推荐' : `符合条件的游戏 ${ranked.length} 款`}</h3>
      ${reason ? `<p class="pick-reason">${esc(reason)}</p>` : `<p class="note">${esc(summary)}</p>`}
      <div class="pick-main">${ranked.map(row).join('')}</div>
      ${excluded.length ? `<details class="pick-excluded"><summary>人数不合适的 ${excluded.length} 款</summary>${excluded.map(row).join('')}</details>` : ''}
      <div class="btn2"><button class="go-btn ghost" id="pBack">改条件</button></div></div>`;
    sheet.querySelector('.sh-body').scrollTop = 0;
    inner.querySelectorAll('.pick-toggle').forEach(button => button.onclick = () => {
      const expand = button.getAttribute('aria-expanded') !== 'true';
      inner.querySelectorAll('.pick-toggle').forEach(b => {
        const on = b === button && expand;
        b.setAttribute('aria-expanded', on);
        b.nextElementSibling.hidden = !on;
      });
    });
    inner.querySelectorAll('[data-enter]').forEach(b => b.onclick = () => { close(); enterGame(b.dataset.enter); });
    inner.querySelector('#pBack').onclick = form;
  }

  async function byFilter(random) {
    const ranked = pool().map(g => ({ g, ...score(g, f) })).sort((a, b) => b.s - a.s);
    const eligible = ranked.filter(r => seats(r.g));
    if (!random) { list(eligible, ranked.filter(r => !seats(r.g))); return; }
    if (!eligible.length) { error(new Error('没有符合人数条件的游戏，请修改条件')); return; }
    const shuffled = eligible.map(r => ({ g: r.g, s: null, why: [], r: Math.random() })).sort((a, b) => a.r - b.r);
    await reveal(shuffled, Promise.resolve(), '随机抽中');
  }

  async function byAI(text) {
    if (!text || busy) return;
    busy = true;
    store.set('pick-ai', text);
    const button = inner.querySelector('#pAsk');
    button.textContent = 'AI 思考中…'; button.disabled = true;
    inner.querySelector('#pErr').innerHTML = '<p class="note" role="status">正在整理推荐，请稍候…</p>';
    inner.querySelectorAll('.tabs button').forEach(b => b.disabled = true);
    try {
      const r = await fetch('/api/pick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      const result = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(result.error || `出错了（${r.status}）`);
      if (!GAMES.some(g => g.key === result.pick) || !result.scores) throw new Error('AI 返回的推荐无效，请重试');
      const ranked = GAMES.map(g => ({ g, s: result.scores[g.key] ?? 0, why: [] })).sort((a, b) => b.s - a.s);
      const top = ranked.findIndex(r => r.g.key === result.pick);
      ranked.unshift(...ranked.splice(top, 1));
      list(ranked, [], result.reason, result.pick);
    } catch (err) { error(err); }
    finally { busy = false; }
  }

  // Blind boxes shuffle until the answer is known (AI may take a few seconds), then the winner pops out and flips over.
  async function reveal(ranked, answer, label) {
    if (busy) return; busy = true;
    const shown = (ranked ? ranked.map(r => r.g) : GAMES).slice(0, 6);
    inner.innerHTML = `<div class="draw shake" id="pDraw"><div class="rays"></div>${shown.map((g, i) => `<div class="mbox" data-i="${i}"><div class="bk">?</div><div class="fr" style="background-image:url(${cover(g)})"></div></div>`).join('')}</div>
      <p class="note" style="text-align:center" id="pSt">盲盒洗牌中……</p>`;
    const draw = inner.querySelector('#pDraw'), boxes = [...draw.querySelectorAll('.mbox')];
    const slots = boxes.map((_, i) => i);
    const spot = i => { const cols = Math.min(3, boxes.length), r = Math.floor(i / cols), c = i % cols, rows = Math.ceil(boxes.length / cols);
      return [(c - (cols - 1) / 2) * 110, (r - (rows - 1) / 2) * 146]; };
    const lay = (rot = 0) => boxes.forEach((b, i) => { const [x, y] = spot(slots[i]); b.style.transform = `translate(${x}px,${y}px) rotate(${(Math.random() - .5) * rot}deg)`; });
    lay(); await wait(250);
    let done = false, result, err;
    answer.then(v => { result = v; done = true; }, e => { err = e; done = true; });
    let d = 90, t0 = performance.now();
    while (!done || performance.now() - t0 < 1700) {
      for (let k = slots.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [slots[k], slots[j]] = [slots[j], slots[k]]; }
      lay(16); await wait(d);
      if (performance.now() - t0 > 1200) d = Math.min(d * 1.08, 220);
    }
    draw.classList.remove('shake');
    if (err) { busy = false; inner.insertAdjacentHTML('beforeend', `<div class="err">${esc(err.message === 'Failed to fetch' ? '网络连接失败，请稍后再试' : err.message)}</div><div class="btn2"><button class="go-btn ghost" id="pBack">返回</button></div>`); inner.querySelector('#pBack').onclick = form; return; }
    if (result) {   // AI answer: rank everything by its scores
      ranked = GAMES.map(g => ({ g, s: result.scores[g.key] ?? 0, why: [] })).sort((a, b) => b.s - a.s);
      const top = ranked.findIndex(r => r.g.key === result.pick);
      if (top > 0) ranked.unshift(...ranked.splice(top, 1));
    }
    const win = ranked[0];
    const wi = shown.indexOf(win.g);
    // the winner box: if it was not among the shown boxes (AI picked outside the first six), dress the first one as it
    const wb = boxes[wi >= 0 ? wi : 0];
    if (wi < 0) wb.querySelector('.fr').style.backgroundImage = `url(${cover(win.g)})`;
    boxes.forEach(b => { if (b !== wb) { b.style.opacity = 0; b.style.transform += ' scale(.6)'; } });
    wb.style.transition = 'transform .7s cubic-bezier(.2,.9,.25,1.2)';
    wb.style.zIndex = 5;
    wb.style.transform = 'translate(0,-6px) scale(1.55)';
    await wait(650);
    draw.classList.add('won');
    wb.style.transform = 'translate(0,-6px) scale(1.55) rotateY(180deg)';
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * Math.PI * 2, r = 120 + Math.random() * 60;
      draw.insertAdjacentHTML('beforeend', `<i class="spark" style="--x:${Math.cos(a) * r}px;--y:${Math.sin(a) * r}px;animation-delay:${Math.random() * .15}s"></i>`);
    }
    navigator.vibrate?.([30, 40, 30]);
    await wait(500);
    inner.querySelector('#pSt').remove();
    result_(win, ranked, label, result?.reason);
    busy = false;
  }

  function result_(win, ranked, label, aiReason) {
    const g = win.g, rt = ratings[g.key];
    const why = aiReason || (label ? '' : win.why.join(' · '));
    inner.insertAdjacentHTML('beforeend', `<div class="res">
      <div class="en2">${esc(g.en || '')}</div><h3>${esc(g.zh)}</h3>
      ${win.s == null ? `<div class="score"><span>${label}</span></div>` : `<div class="score"><b id="pScore">0</b><span>推荐指数</span></div>`}
      ${why ? `<p class="why">${esc(why)}</p>` : ''}
      <div class="meta"><span>${span(g.players)} 人</span><span>${span(g.time)} 分钟</span><span>重度 ${g.weight}</span>${g.tags.slice(0, 3).map(t => `<span>${esc(t)}</span>`).join('')}${rt?.count ? `<span style="color:#f2c94c">★ ${rt.avg} · ${rt.count} 条评价</span>` : ''}</div>
      ${g.intro ? `<p class="why" style="margin-top:0">${esc(g.intro)}</p>` : ''}
      ${g.expansions?.length ? `<p class="exps">扩展：${g.expansions.map(x => esc(x.zh || x.en)).join('、')}</p>` : ''}
      <div class="btn2">${g.url ? `<button class="go-btn" id="pEnter">进入${esc(g.zh)}助手</button>` : '<button class="go-btn" disabled>这款还没有助手</button>'}</div>
      <div class="btn2"><button class="go-btn ghost" id="pAgain">再抽一次</button><button class="go-btn ghost" id="pBack">改条件</button></div>
      ${win.s == null ? '' : `<div class="rank"><b>其他游戏的推荐指数</b>${ranked.slice(1, 7).map(r => `<div><i style="background-image:url(${cover(r.g)})"></i><em>${esc(r.g.zh)}</em><span class="bar"><u style="width:${r.s}%"></u></span><s>${r.s}</s></div>`).join('')}</div>`}
    </div>`);
    const sc = inner.querySelector('#pScore');
    if (sc) { const t0 = performance.now(); (function up(t) { const p = Math.min(1, (t - t0) / 900); sc.textContent = Math.round(win.s * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(up); })(t0); }
    inner.querySelector('#pEnter')?.addEventListener('click', () => { close(); enterGame(g.key); });
    inner.querySelector('#pAgain').onclick = () => tab === 'ai' ? byAI(store.get('pick-ai', '')) : byFilter(label != null);
    inner.querySelector('#pBack').onclick = form;
  }

  form();
}
