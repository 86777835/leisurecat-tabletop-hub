// 进群交流：微信群二维码。群二维码 7 天过期，换新图时改文件名（img/ 缓存 7 天），并改下面的日期。
// 新图先压成 16 色 PNG（原图 60 KB+，跨境慢网容易加载不出来），压完用 jsQR 解码确认链接没变。
const QR = 'img/group-1116s.png', UNTIL = '11 月 16 日';
const SEEN = 'group-tip';
const seen = () => { try { return !!localStorage.getItem(SEEN); } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch {} };

export function open() {
  markSeen();
  document.querySelector('.gtip')?.remove();
  const wx = /MicroMessenger/i.test(navigator.userAgent);
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<div class="sh-head"><h2>进群交流</h2><button class="sh-x" aria-label="关闭">×</button></div>
    <div class="sh-body"><div class="sh-inner group">
      <p class="note">反馈问题、提建议、约局都可以。</p>
      <img src="${QR}" alt="桌游开局助手交流群二维码" width="360" height="547">
      <p class="tip">${wx ? '长按二维码，选“识别图中二维码”进群' : '截图保存后，用微信“扫一扫”从相册选这张图进群'}</p>
      <p class="note">二维码 ${UNTIL}前有效。</p>
    </div></div>`;
  document.body.appendChild(sheet);
  sheet.querySelector('.sh-x').onclick = () => { sheet.classList.add('out'); setTimeout(() => sheet.remove(), 220); };
}

// One-time hint next to the 进群 button. Called a few seconds after the homepage opens; it also fetches the QR
// ahead of time so the sheet shows it at once. Waits while another panel is open or a game is being entered.
export function tip() {
  new Image().src = QR;
  if (seen()) return;
  const busy = () => document.querySelector('.sheet') || document.body.classList.contains('going');
  const t = setInterval(() => {
    if (seen()) return clearInterval(t);
    if (busy()) return;
    clearInterval(t);
    const el = document.createElement('div');
    el.className = 'gtip';
    el.innerHTML = `<p>有问题、想约局？<br>来交流群聊聊</p><button class="go">看二维码</button><button class="x" aria-label="不再提示">×</button>`;
    document.body.appendChild(el);
    el.querySelector('.go').onclick = open;
    el.querySelector('.x').onclick = () => { markSeen(); el.remove(); };
  }, 1000);
}
