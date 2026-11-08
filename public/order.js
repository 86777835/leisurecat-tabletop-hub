// 定先后手：通用于所有桌游。两种方式：
//   手指轮盘：选好人数，每人一根手指按住屏幕；人齐后按住 1.5 秒，光圈轮转后显示 1、2、3… 的顺序
//   随机排序：填名字，像从袋子里摸棋子一样逐个抽出顺序
const COLORS = ['#ff5a5f', '#3fa7ff', '#ffd23f', '#3ddc84', '#b57bff', '#ff8c42', '#2de2e6', '#ff6fb5'];
const HOLD_MS = 1500;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const wait = ms => new Promise(r => setTimeout(r, ms));
// Sister sites link here as /?order=<人数>&back=<their page>; closing the sheet then returns to that page.
const BACK_OK = /^(https:\/\/[a-z0-9-]+\.leisurecat\.cloud|http:\/\/localhost:\d+)\//;

export function open({ n: n0, back } = {}) {
  let n = n0 >= 2 && n0 <= 8 ? n0 : store.get('order-n', 4), tab = store.get('order-tab', 'finger');
  if (back && !BACK_OK.test(back)) back = null;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sh-head">${back ? '<button class="sh-back">‹ 返回</button>' : ''}<h2>定先后手</h2>${back ? '' : '<button class="sh-x" aria-label="关闭">×</button>'}</div>
    <div class="sh-body"><div class="sh-inner">
      <div class="tabs"><button data-t="finger">手指轮盘</button><button data-t="bag">随机排序</button></div>
      <div class="grp"><b>几个人</b><div class="chips" id="oN">${[2, 3, 4, 5, 6, 7, 8].map(i => `<button data-n="${i}">${i}</button>`).join('')}</div></div>
      <div id="oPane"></div>
    </div></div>`;
  document.body.appendChild(sheet);
  const close = () => { sheet.classList.add('out'); setTimeout(() => sheet.remove(), 220); };
  if (back) sheet.querySelector('.sh-back').onclick = () => location.replace(back);
  else sheet.querySelector('.sh-x').onclick = close;
  sheet.querySelector('.tabs').onclick = e => { const t = e.target.dataset.t; if (t) { tab = t; store.set('order-tab', t); render(); } };
  sheet.querySelector('#oN').onclick = e => { const v = +e.target.dataset.n; if (v) { n = v; store.set('order-n', v); render(); } };

  function render() {
    sheet.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    sheet.querySelectorAll('#oN button').forEach(b => b.classList.toggle('on', +b.dataset.n === n));
    const pane = sheet.querySelector('#oPane');
    if (tab === 'finger') {
      pane.innerHTML = `<p class="note">把手机平放在桌子中间，${n} 个人各用一根手指按住屏幕。每根手指下会出现一个光圈，人齐后保持按住，光圈转完就会显示每个人的顺序。</p>
        <div class="btn2"><button class="go-btn" id="oStart">开始</button></div>`;
      pane.querySelector('#oStart').onclick = () => finger(n);
    } else {
      const names = store.get('order-names', []);
      pane.innerHTML = `<div class="names">${Array.from({ length: n }, (_, i) => `<input maxlength="12" placeholder="玩家 ${i + 1}" value="${esc(names[i] || '')}">`).join('')}</div>
        <div class="bag" id="oBag"><i></i></div><div class="order" id="oOut"></div>
        <div class="btn2"><button class="go-btn" id="oDraw">从袋子里抽顺序</button></div>`;
      pane.querySelector('#oDraw').onclick = () => bag(pane);
    }
  }

  async function bag(pane) {
    const inputs = [...pane.querySelectorAll('.names input')];
    store.set('order-names', inputs.map(i => i.value.trim()));
    const people = inputs.map((inp, i) => ({ name: inp.value.trim() || `玩家 ${i + 1}`, c: COLORS[i % COLORS.length] }));
    const btn = pane.querySelector('#oDraw'), bagEl = pane.querySelector('#oBag'), out = pane.querySelector('#oOut');
    btn.disabled = true; out.innerHTML = ''; bagEl.classList.add('shake');
    await wait(700);
    for (const [i, p] of shuffle(people).entries()) {
      out.insertAdjacentHTML('beforeend', `<div style="--c:${p.c}"><b>${i + 1}</b>${esc(p.name)}${i === 0 ? '<small style="margin-left:auto;color:var(--brass);font-size:13px">先手</small>' : ''}</div>`);
      navigator.vibrate?.(15);
      await wait(i === people.length - 1 ? 0 : 420);
    }
    bagEl.classList.remove('shake'); btn.disabled = false; btn.textContent = '再抽一次';
  }

  render();
}

// ---------- finger chooser ----------
function finger(n) {
  const fz = document.createElement('div');
  fz.className = 'fz';
  fz.innerHTML = `<div class="fz-top"><button class="sh-x" aria-label="关闭">×</button><div class="note" style="margin:0;flex:1">${n} 人 · 各放一根手指</div></div>
    <div class="fz-flood"></div><div class="fz-msg"></div>`;
  document.body.appendChild(fz);
  const msg = fz.querySelector('.fz-msg'), flood = fz.querySelector('.fz-flood');
  const fingers = new Map();   // pointerId → { el, x, y, c }
  let phase = 'wait', holdStart = 0, raf = 0, freeColors = COLORS.slice(0, Math.max(n, 2));

  const say = () => {
    const k = fingers.size;
    msg.innerHTML = phase === 'done' ? '' : k === 0 ? `<b>${n} 根手指</b>都按到屏幕上`
      : k < n ? `<b>${k} / ${n}</b>还差 ${n - k} 根手指` : k > n ? `<b>多了 ${k - n} 根</b>请拿开多出来的手指` : '<b>按住别动</b>';
  };
  const close = () => { cancelAnimationFrame(raf); fz.remove(); };
  fz.querySelector('.sh-x').addEventListener('pointerdown', e => { e.stopPropagation(); close(); });

  function reset() {
    phase = 'wait'; holdStart = 0;
    fz.style.background = ''; flood.style.transform = 'scale(0)';
  }

  fz.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && navigator.maxTouchPoints > 0) return;   // touch screens also send a mouse pointer for the first finger
    if (phase === 'done') {   // a new round starts once every finger of the last round has lifted
      if (fingers.size) return;
      fz.querySelectorAll('.fring').forEach(r => r.remove());
      freeColors = COLORS.slice(0, Math.max(n, 2)); reset();
    }
    if (phase === 'spin') return;
    const c = freeColors.shift() || COLORS[fingers.size % COLORS.length];
    const el = document.createElement('div');
    el.className = 'fring'; el.style.setProperty('--c', c);
    el.innerHTML = '<svg viewBox="0 0 144 144"><circle cx="72" cy="72" r="66.8"/></svg><div class="num"></div>';
    fz.appendChild(el);
    fingers.set(e.pointerId, { el, c, x: e.clientX, y: e.clientY });
    place(e.pointerId);
    fz.setPointerCapture?.(e.pointerId);
    holdStart = 0; say(); tick();
  });
  fz.addEventListener('pointermove', e => { const f = fingers.get(e.pointerId); if (f) { f.x = e.clientX; f.y = e.clientY; place(e.pointerId); } });
  const up = e => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    fingers.delete(e.pointerId);
    if (phase === 'done') { if (fingers.size === 0) setTimeout(() => { if (phase === 'done' && fingers.size === 0) msg.innerHTML = '<b>再来一次？</b>大家重新按住屏幕'; }, 400); return; }
    f.el.remove(); freeColors.unshift(f.c);
    if (phase === 'spin') { phase = 'wait'; fingers.forEach(g => g.el.classList.remove('hl')); }
    holdStart = 0; say();
  };
  fz.addEventListener('pointerup', up);
  fz.addEventListener('pointercancel', up);
  const place = id => { const f = fingers.get(id); f.el.style.transform = ''; f.el.style.left = f.x + 'px'; f.el.style.top = f.y + 'px'; };

  // exactly n fingers held for HOLD_MS → spin
  function tick() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function loop(t) {
      if (phase !== 'wait') return;
      if (fingers.size === n) {
        holdStart ||= t;
        const p = Math.min(1, (t - holdStart) / HOLD_MS);
        fingers.forEach(f => f.el.style.setProperty('--p', p));
        if (p >= 1) { spin(); return; }
      } else {
        holdStart = 0; fingers.forEach(f => f.el.style.setProperty('--p', 0));
      }
      raf = requestAnimationFrame(loop);
    });
  }

  // a highlight runs round the rings, slowing down, then everyone gets a number
  async function spin() {
    phase = 'spin'; msg.innerHTML = '';
    const list = [...fingers.values()];
    const order = shuffle(list);
    let i = 0, delay = 60;
    while (delay < 260) {
      if (phase !== 'spin') return;
      list.forEach(f => f.el.classList.remove('hl'));
      list[i % list.length].el.classList.add('hl');
      navigator.vibrate?.(8);
      await wait(delay);
      i++; delay *= 1.12;
    }
    if (phase !== 'spin') return;
    list.forEach(f => f.el.classList.remove('hl'));
    phase = 'done';
    const first = order[0];
    flood.style.background = first.c; flood.style.left = first.x + 'px'; flood.style.top = first.y + 'px';
    flood.style.transform = `scale(${Math.hypot(innerWidth, innerHeight) / 4})`;
    navigator.vibrate?.([40, 60, 40]);
    for (const [k, f] of order.entries()) {
      const num = f.el.querySelector('.num');
      num.textContent = k + 1;
      f.el.classList.add(k === 0 ? 'first' : 'lose');
      num.classList.add('on');
      await wait(k === 0 ? 380 : 180);
    }
  }

  say();
}
