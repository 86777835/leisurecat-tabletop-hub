// 进群交流：微信群二维码。群二维码 7 天过期，换新图时改文件名（img/ 缓存 7 天），并改下面的日期。
const QR = 'img/group-1116.png', UNTIL = '11 月 16 日';

export function open() {
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
