(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const page = $('#mobileapp');
  if (!page || page.dataset.mobileReady === '1') return;
  page.dataset.mobileReady = '1';
  let installPrompt = null;
  const fallbackVersion = '0.2.17';
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
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
      text('appVersionState', app === latest ? '当前已是最新登记测试版本' : '发现新测试版本，请下载新版 APK');
      if (app !== latest) text('appUpdateText', '发现新测试版本 ' + latest + '。已安装的 APK 不能由网页直接替换，请下载新版测试包并手动安装。');
    } catch (_) {
      text('appVersionState', '无法读取服务器版本；显示本地客户端版本');
      text('appCurrent', fallbackVersion);
      text('serverVersion', '暂不可用');
      text('appLatest', '未能检查');
    }
  }
  const updateState = () => {
    const installed = standalone();
    text('appMode', installed ? '已安装模式' : '浏览器模式');
    if (!$('#appCurrent').textContent.trim() || $('#appCurrent').textContent === 'SYNC.01') text('appCurrent', fallbackVersion);
    text('appUpdateText', installed
      ? '当前以独立应用窗口运行。可检查在线版本并刷新网页资源。'
      : '此设备当前通过浏览器访问。符合条件时可安装到桌面；安装后仍需联网使用服务器功能。');
    const btn = $('#appInstall');
    btn.textContent = installed ? '已在应用模式中运行' : (installPrompt ? '⇩ 安装手机客户端' : '⇩ 查看安装选项');
    btn.disabled = installed;
    btn.style.opacity = installed ? '.65' : '1';
    text('appHelp', installPrompt ? '浏览器已提供安装选项，可点击上方按钮继续。' : '若没有安装弹窗，请使用 Chrome 菜单中的“安装应用”或“添加到主屏幕”。');
  };
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; updateState(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; updateState(); text('appHelp', '系统已报告安装完成。'); });
  $('#appInstall').addEventListener('click', async () => {
    if (standalone()) return;
    if (!window.isSecureContext) { text('appHelp', '安装需要 HTTPS 安全连接。'); return; }
    if (installPrompt) {
      try { installPrompt.prompt(); await installPrompt.userChoice; }
      catch (_) { text('appHelp', '请从浏览器菜单选择“安装应用”或“添加到主屏幕”。'); }
      finally { installPrompt = null; updateState(); }
      return;
    }
    text('appHelp', /Android/i.test(navigator.userAgent)
      ? '在 Chrome 右上角 ⋮ 菜单中选择“安装应用”或“添加到主屏幕”。'
      : '请在浏览器菜单中查找“添加到主屏幕”或“安装应用”。');
  });
  $('#appRefresh').addEventListener('click', async () => {
    const button = $('#appRefresh');
    button.disabled = true; button.textContent = '正在检查…';
    try {
      const response = await fetch('/api/status?version-check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('server');
      await loadVersions();
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.update().catch(() => {})));
      }
      text('appVersionState', '服务器已连接，版本信息已刷新');
      text('appUpdateText', '服务器响应正常。即将刷新网页以获取当前可用资源；不会删除服务端聊天历史。');
      setTimeout(() => location.reload(), 450);
    } catch (_) {
      text('appUpdateText', '暂时无法连接服务器。请检查网络后重试；数据未更改。');
      button.disabled = false; button.textContent = '重新检查';
    }
  });
  updateState(); loadVersions();
  window.addEventListener('pageshow', () => { updateState(); loadVersions(); });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateState);
})();