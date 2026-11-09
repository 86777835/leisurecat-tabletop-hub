// 玩家评价（/api/reviews）：各助手站终局后提交的算“已游玩”；首页随时可以写，自己选已游玩或未游玩。
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
const day = t => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
// One review per phone per game: the server replaces this phone's earlier review of the same game.
const device = () => { let id = store.get('rv-dev', ''); if (!id) { id = 'h' + Math.random().toString(36).slice(2, 9); store.set('rv-dev', id); } return id; };
const GROUPS = [['all', '全部'], ['played', '已游玩'], ['unplayed', '未游玩']];
// Sister sites link here as /?rate=<game>&back=<their page>: the form opens at once, and 返回 goes back to that page (same rule as order.js).
const BACK_OK = /^(https:\/\/[a-z0-9-]+\.leisurecat\.cloud|http:\/\/localhost:\d+)\//;

export async function open(g, onSaved, { back, write } = {}) {
  if (back && !BACK_OK.test(back)) back = null;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sh-head">${back ? '<button class="sh-back">‹ 返回</button>' : ''}<h2>${esc(g.zh)} · 玩家评价</h2>${back ? '' : '<button class="sh-x" aria-label="关闭">×</button>'}</div>
    <div class="sh-body"><div class="sh-inner" id="rvIn"></div></div>`;
  document.body.appendChild(sheet);
  if (back) sheet.querySelector('.sh-back').onclick = () => location.replace(back);
  else sheet.querySelector('.sh-x').onclick = () => { sheet.classList.add('out'); setTimeout(() => sheet.remove(), 220); };
  const box = sheet.querySelector('#rvIn');
  let data = null, group = 'all';

  async function load() {
    box.innerHTML = '<p class="empty">加载中……</p>';
    try {
      const r = await fetch('/api/reviews?game=' + g.key);
      if (!r.ok) throw new Error(`加载失败（${r.status}）`);
      data = await r.json();
      list();
    } catch (e) { box.innerHTML = `<div class="err">${esc(e.message === 'Failed to fetch' ? '网络连接失败，请稍后再试' : e.message)}</div>`; }
  }

  function list() {
    const mine = store.get('rv-mine-' + g.key, null);
    const head = `<div class="btn2 rv-write"><button class="go-btn" id="rvW">${mine ? '修改我的评价' : '写评价'}</button></div>
      <p class="note" style="text-align:center;margin-bottom:12px">没打完、没玩过也能评，提交时选一下“已游玩”或“未游玩”。</p>`;
    if (!data.count) { box.innerHTML = head + '<p class="empty">还没有评价，来打第一个分吧。</p>'; bindWrite(); return; }
    const s = group === 'all' ? data : data[group];
    const items = data.items.filter(x => group === 'all' || x.played === (group === 'played'));
    const max = Math.max(...s.dist);
    box.innerHTML = head + `<div class="tabs">${GROUPS.map(([k, t]) => `<button data-g="${k}" class="${k === group ? 'on' : ''}">${t} ${(k === 'all' ? data : data[k]).count}</button>`).join('')}</div>
      ${s.count ? `<div class="rv-sum"><div class="big"><b>${s.avg}</b><span>${s.count} 条评价</span></div>
      <div class="rv-dist">${[5, 4, 3, 2, 1].map(n => `<div>${n} 星<u><i style="width:${max ? s.dist[n - 1] / max * 100 : 0}%"></i></u>${s.dist[n - 1]}</div>`).join('')}</div></div>` : '<p class="empty">这一类还没有评价。</p>'}
      ${items.map(x => `<div class="rv-item"><div class="h"><b>${esc(x.name)}</b><span class="rv-tag${x.played ? '' : ' un'}">${x.played ? '已游玩' : '未游玩'}</span><span class="st">${stars(x.stars)}</span><span style="margin-left:auto">${day(x.at)}</span></div>${x.text ? `<p>${esc(x.text)}</p>` : ''}</div>`).join('')}`;
    box.querySelector('.tabs').onclick = e => { const k = e.target.closest('button')?.dataset.g; if (k) { group = k; list(); } };
    bindWrite();
  }
  const bindWrite = () => { box.querySelector('#rvW').onclick = form; };

  function form() {
    const mine = store.get('rv-mine-' + g.key, {});
    let played = mine.played ?? null, n = mine.stars || 0;
    box.innerHTML = `<div class="grp"><b>玩过这款游戏吗</b><div class="chips" id="rvP"><button data-p="1">已游玩</button><button data-p="0">未游玩</button></div></div>
      <div class="grp"><b>打分</b><div class="rv-stars" id="rvS">${[1, 2, 3, 4, 5].map(i => `<button data-s="${i}" aria-label="${i} 星">★</button>`).join('')}</div></div>
      <div class="grp"><b>昵称</b><input class="inp" id="rvN" maxlength="20" placeholder="桌上大家怎么叫你" value="${esc(mine.name || store.get('rv-name', ''))}"></div>
      <div class="grp"><b>说两句（可不填）</b><textarea class="ta" id="rvT" maxlength="300" placeholder="好玩在哪、哪里劝退、适合什么人">${esc(mine.text || '')}</textarea></div>
      <div class="btn2"><button class="go-btn ghost" id="rvC">取消</button><button class="go-btn" id="rvOk">提交</button></div><div id="rvE"></div>`;
    const paint = () => {
      box.querySelectorAll('#rvP button').forEach(b => b.classList.toggle('on', played !== null && +b.dataset.p === +played));
      box.querySelectorAll('#rvS button').forEach(b => b.classList.toggle('on', +b.dataset.s <= n));
    };
    box.querySelector('#rvP').onclick = e => { const b = e.target.closest('button'); if (b) { played = b.dataset.p === '1'; paint(); } };
    box.querySelector('#rvS').onclick = e => { const b = e.target.closest('button'); if (b) { n = +b.dataset.s; paint(); } };
    box.querySelector('#rvC').onclick = () => data ? list() : load();
    box.querySelector('#rvOk').onclick = async () => {
      const name = box.querySelector('#rvN').value.trim(), text = box.querySelector('#rvT').value.trim(), err = box.querySelector('#rvE');
      const miss = played === null ? '请选择已游玩或未游玩' : !n ? '请点星星打分' : !name ? '请填一个昵称' : '';
      if (miss) { err.innerHTML = `<div class="err">${miss}</div>`; return; }
      const btn = box.querySelector('#rvOk'); btn.disabled = true; btn.textContent = '提交中……';
      try {
        const r = await fetch('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ game: g.key, stars: n, name, text, device: device(), played }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `提交失败（${r.status}）`);
        store.set('rv-mine-' + g.key, { played, stars: n, name, text }); store.set('rv-name', name);
        onSaved?.(g.key, { avg: j.avg, count: j.count });
        group = 'all'; await load();
      } catch (e) {
        err.innerHTML = `<div class="err">${esc(e.message === 'Failed to fetch' ? '网络连接失败，请稍后再试' : e.message)}</div>`;
        btn.disabled = false; btn.textContent = '提交';
      }
    };
    paint();
  }

  // from a sister site's 写评价 button: show the form first; 取消 / 提交 then lead to the list
  if (write) form(); else load();
}
