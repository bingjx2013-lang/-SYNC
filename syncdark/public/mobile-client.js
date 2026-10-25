(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const page = $('#mobileapp');
  if (!page || page.dataset.mobileReady === '1') return;
  page.dataset.mobileReady = '1';
  const fallbackVersion = 'v0.3.3.2';
  const text = (id, value) => { const el = $('#' + id); if (el) el.textContent = value; };
  async function loadApkVersion() {
    try {
      const response = await fetch('/api/android/version?check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('apk-version');
      const data = await response.json();
      if (data.status !== 'available') throw new Error('apk-unavailable');
      const size = Number(data.sizeBytes);
      const sizeLabel = Number.isFinite(size) && size > 0
        ? (size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : Math.ceil(size / 1024) + ' KB')
        : '大小未知';
      const published = data.publishedAt ? new Date(data.publishedAt).toLocaleString() : '时间未知';
      text('apkVersionInfo', '可下载版本：' + String(data.versionName) + '（构建号 ' + String(data.versionCode) + '） · ' + sizeLabel + ' · 发布于 ' + published);
    } catch (_) {
      text('apkVersionInfo', '尚未取得已发布安装包的版本信息；下载按钮会继续使用固定官方地址，安装包发布后这里会自动显示新版本。');
    }
  }

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
    btn.addEventListener('click', async () => {
      const progress = $('#appProgress');
      const status = $('#appDownloadStatus');
      const progressText = $('#appProgressText');
      const title = $('#appDownloadTitle');
      btn.disabled = true;
      if (progress) progress.style.width = '8%';
      if (status) status.textContent = '正在检查签名版安装包…';
      if (progressText) progressText.textContent = '检查中';
      if (title) title.textContent = '正在检查安装包';
      try {
        const probe = await fetch('/api/download/android.apk', { method: 'HEAD', cache: 'no-store' });
        if (!probe.ok) throw new Error('apk-not-ready');
        if (progress) progress.style.width = '35%';
        if (status) status.textContent = '已找到安装包，正在启动系统下载…';
        if (progressText) progressText.textContent = '准备下载';
        window.location.href = '/api/download/android.apk';
        window.setTimeout(() => {
          if (status) status.textContent = '已发起下载；请检查通知栏或下载记录';
          if (progressText) progressText.textContent = '已请求';
          if (title) title.textContent = '等待系统下载';
          btn.disabled = false;
        }, 1500);
      } catch (_) {
        if (progress) progress.style.width = '0%';
        if (status) status.textContent = '稳定签名版 APK 尚未发布，请先完成签名配置';
        if (progressText) progressText.textContent = '暂不可下载';
        if (title) title.textContent = '签名配置待完成';
        text('appUpdateText', '为避免安装签名冲突，暂时停止分发旧的调试签名 APK。请完成固定签名配置后再下载安装。');
        btn.disabled = false;
      }
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
      await Promise.all([loadVersions(), loadApkVersion()]);
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
  loadApkVersion();
  window.addEventListener('pageshow', () => { loadVersions(); loadApkVersion(); });
})();