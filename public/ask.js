import { routeQuestion } from './ask-router.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
export function initAsk(games, centeredGame) {
  let current = null, messages = [], busy = false, pending = null;
  document.body.insertAdjacentHTML('beforeend', `
    <button class="cfab" aria-label="打开桌游规则问答"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.6 21l4.3-2.4c1 .3 2 .4 3.1.4 5.5 0 10-3.6 10-8s-4.5-8-10-8z"/></svg>问答</button>
    <section class="cpanel" hidden role="dialog" aria-label="桌游规则问答">
      <header class="chd"><div><b>桌游规则问答</b><small>先选游戏 · 再查规则</small></div><button class="cx" aria-label="关闭问答">×</button></header>
      <div class="clog" aria-live="polite"><div class="cwel"><b>有规则问题，尽管问</b><p>问任何已收录游戏的规则。不确定是哪款时，请先选游戏。</p></div>
      <div class="csug">${['匹兹堡的石油城怎么用？', '奥丁的维京人怎么移民？', '梅林能看到莫德雷德吗？', '起义的沙虫奖励怎么翻倍？'].map(q => `<button>${q}</button>`).join('')}</div></div>
      <form class="cin"><textarea rows="1" maxlength="490" placeholder="输入游戏名和规则问题…" aria-label="规则问题" enterkeyhint="send"></textarea><button aria-label="发送问题">➤</button></form>
      <footer class="cfoot">回答仅供参考，以官方规则书为准</footer>
    </section>`);
  const $ = s => document.querySelector(s), panel = $('.cpanel'), log = $('.clog'), input = $('.cin textarea'), send = $('.cin button');
  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const row = (cls, html) => { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; log.append(el); scroll(); return el; };
  const open = on => { panel.hidden = !on; $('.cfab').hidden = on; if (!on) $('.cfab').focus(); };
  $('.cfab').onclick = () => open(true);
  $('.cx').onclick = () => open(false);
  panel.onkeydown = e => { if (e.key === 'Escape') open(false); };
  $('.csug').onclick = e => { if (e.target.closest('button')) ask(e.target.textContent); };
  $('.cin').onsubmit = e => { e.preventDefault(); ask(input.value); };
  input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } };
  function ask(q) {
    q = q.trim(); if (!q || busy) return;
    pending?.remove(); pending = null;
    input.value = ''; $('.csug')?.remove(); row('cm u', fmt(q));
    const route = routeQuestion(q, games, current);
    if (route.kind === 'unavailable') { row('cm a', '这款还没有收录规则资料'); return; }
    if (route.kind === 'send') { answer(q, route.key); return; }
    const selected = route.keys.includes(centeredGame()) ? centeredGame() : null;
    pending = row('cchoices', '<p>这条问题问的是哪款游戏？点选后发送。</p>' + route.keys.map(key => `<button data-game="${key}" aria-pressed="${key === selected}">${esc(games.find(g => g.key === key).zh)}</button>`).join(''));
    pending.onclick = e => { const b = e.target.closest('button'); if (!b) return; pending.remove(); pending = null; answer(q, b.dataset.game); };
  }
  async function answer(q, key) {
    busy = true; send.disabled = true;
    const game = games.find(g => g.key === key);
    if (current !== key) {
      if (current) row('cswitch', `已切换到 ${esc(game.zh)}`);
      current = key; messages = [];
    }
    const requestMessages = [...messages, { role: 'user', content: q }].slice(-10);
    const out = row('cm a', `<strong class="cgame">${esc(game.zh)}</strong><div class="canswer">正在查规则…</div><a href="${esc(game.url)}">进入 ${esc(game.zh)} 助手 ›</a>`);
    const content = out.querySelector('.canswer');
    let text = '', completed = false, reader;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: key, messages: requestMessages }), signal: ctl.signal });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `出错了（${res.status}）`);
      reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      function line(s) {
        if (!s.startsWith('data:')) return;
        const data = s.slice(5).trim();
        if (data === '[DONE]') { completed = true; return; }
        const j = JSON.parse(data);
        if (j.error) throw new Error(j.error);
        if (j.reset) { text = ''; content.textContent = '正在重新回答…'; return; }
        const piece = j.choices?.[0]?.delta?.content;
        if (piece) { text += piece; content.innerHTML = fmt(text); scroll(); }
      }
      for (;;) {
        const { done, value } = await reader.read();
        buf += done ? dec.decode() : dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
        if (done) { if (buf.trim()) line(buf.trim()); break; }
      }
      if (!completed) throw new Error('网络连接中断，回答未完成，请重新提问');
      if (!text) throw new Error('没有收到回答，请再问一次');
      messages = [...requestMessages, { role: 'assistant', content: text }];
    } catch (e) {
      out.classList.add('err');
      const net = e instanceof TypeError || /network|Failed to fetch|Load failed|terminated/i.test(e.message);
      content.innerHTML = (text ? fmt(text) + '<br>' : '') + esc(ctl.signal.aborted ? '等待超过 30 秒，请稍后再试' : net ? '网络连接失败，请检查网络后再试' : e.message);
    } finally {
      clearTimeout(timer); await reader?.cancel().catch(() => {}); busy = false; send.disabled = false; scroll();
    }
  }
}
