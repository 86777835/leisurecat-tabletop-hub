// 玩家评价：各助手站终局后提交的星级与评论（/api/reviews），这里按游戏展示。
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
const day = t => { const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; };

export async function open(g) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sh-head"><h2>${esc(g.zh)} · 玩家评价</h2><button class="sh-x" aria-label="关闭">×</button></div>
    <div class="sh-body"><div class="sh-inner" id="rvIn"><p class="empty">加载中……</p></div></div>`;
  document.body.appendChild(sheet);
  sheet.querySelector('.sh-x').onclick = () => { sheet.classList.add('out'); setTimeout(() => sheet.remove(), 220); };
  const box = sheet.querySelector('#rvIn');
  try {
    const r = await fetch('/api/reviews?game=' + g.key);
    if (!r.ok) throw new Error(`加载失败（${r.status}）`);
    const d = await r.json();
    if (!d.count) { box.innerHTML = '<p class="empty">还没有评价。打完一局后，在结算页给这款游戏打个分吧。</p>'; return; }
    const max = Math.max(...d.dist);
    box.innerHTML = `<div class="rv-sum"><div class="big"><b>${d.avg}</b><span>${d.count} 条评价</span></div>
      <div class="rv-dist">${[5, 4, 3, 2, 1].map(s => `<div>${s} 星<u><i style="width:${max ? d.dist[s - 1] / max * 100 : 0}%"></i></u>${d.dist[s - 1]}</div>`).join('')}</div></div>
      ${d.items.map(x => `<div class="rv-item"><div class="h"><b>${esc(x.name)}</b><span class="st">${stars(x.stars)}</span><span style="margin-left:auto">${day(x.at)}</span></div>${x.text ? `<p>${esc(x.text)}</p>` : ''}</div>`).join('')}`;
  } catch (e) {
    box.innerHTML = `<div class="err">${esc(e.message === 'Failed to fetch' ? '网络连接失败，请稍后再试' : e.message)}</div>`;
  }
}
