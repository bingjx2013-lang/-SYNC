(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const page = $('#mobileapp');
  if (!page || page.dataset.mobileReady === '1') return;
  page.dataset.mobileReady = '1';
  const fallbackVersion = '0.2.17';
  const text = (id, value) => { const el = $('#' + id); if (el) el.textContent = value; };
  async function loadVersions() {
    text('appVersionState', '正在检查版本…');
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('status');
      const data = await response.json();
      const app = String(data.appVersion || fallbackVersion);
      const latest = String(data.latestAppVersion || app);
      text('appCurrent', app);
      text('serverVersion', 'SYS.V ' + String(data.serverVersion || '未知'));
      text('appLatest', latest);
      text('appVersionState', app === latest ? '当前已是最新登记测试版本' : '发现新测试版本，请获取新版 APK');
      text('appUpdateText', app === latest
        ? '这是版本登记状态，不代表手机已安装该 APK。Android 安装包需要单独下载并由系统安装。'
        : '发现新测试版本 ' + latest + '。请从 Android APK 构建记录下载 APK，不要使用网页安装按钮代替。');
    } catch (_) {
      text('appVersionState', '无法读取服务器版本');
      text('appCurrent', fallbackVersion);
      text('serverVersion', '暂不可用');
      text('appLatest', '未能检查');
      text('appUpdateText', '服务器版本接口暂不可用。此处不会触发网页应用安装。');
    }
  }
  const btn = $('#appInstall');
  if (btn) {
    btn.textContent = '↓ 获取 Android APK 安装包';
    btn.disabled = false;
    btn.addEventListener('click', () => {
      window.location.href = 'https://github.com/bingjx2013-lang/-SYNC/actions/workflows/android-client-apk.yml';
    });
  }
  const refresh = $('#appRefresh');
  if (refresh) refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    refresh.textContent = '正在检查…';
    try {
      const response = await fetch('/api/status?version-check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('server');
      await loadVersions();
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.update().catch(() => {})));
      }
      refresh.textContent = '检查完成';
      setTimeout(() => location.reload(), 500);
    } catch (_) {
      text('appUpdateText', '暂时无法连接服务器；请检查网络后重试。');
      refresh.disabled = false;
      refresh.textContent = '重新检查版本';
    }
  });
  text('appMode', 'Android APK / 测试渠道');
  loadVersions();
  window.addEventListener('pageshow', loadVersions);
})();