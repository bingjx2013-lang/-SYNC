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
      text('appVersionState', app === latest ? '当前已是最新版本，可以查看更新内容或重新下载安装包。' : '发现新测试版本，请获取新版 APK。');
      text('appUpdateText', app === latest
        ? '常规更新 · 聊天同步与连接稳定性优化。版本登记不代表手机已安装该 APK。'
        : '发现新测试版本 ' + latest + '。下载 APK 后，请按 Android 系统提示完成安装。');
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
    btn.textContent = '⇩　获取 Android 安装包';
    btn.disabled = false;
    btn.addEventListener('click', () => {
      const progress = $('#appProgress');
      const status = $('#appDownloadStatus');
      const progressText = $('#appProgressText');
      const title = $('#appDownloadTitle');
      if (progress) progress.style.width = '35%';
      if (status) status.textContent = '正在请求测试 APK…';
      if (progressText) progressText.textContent = '准备中';
      if (title) title.textContent = '正在准备安装包';
      window.location.href = '/api/download/android.apk';
      window.setTimeout(() => {
        if (progress) progress.style.width = '35%';
        if (status) status.textContent = '已发起下载；请检查浏览器下载记录';
        if (progressText) progressText.textContent = '已请求';
        if (title) title.textContent = '下载请求已发送';
      }, 1200);
    });
  }
  const website = $('#appWebsite');
  if (website) website.addEventListener('click', () => window.open('/', '_self'));
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