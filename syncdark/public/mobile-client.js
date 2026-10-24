(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const page = $('#mobileapp');
  if (!page || page.dataset.mobileReady === '1') return;
  page.dataset.mobileReady = '1';
  let installPrompt = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const updateState = () => {
    const installed = standalone();
    $('#appMode').textContent = installed ? '已安装模式' : '浏览器模式';
    $('#appCurrent').textContent = installed ? '已安装' : '网页访问';
    $('#appLatest').textContent = '在线';
    $('#appUpdateText').textContent = installed
      ? '当前以独立应用窗口运行。点击“检查更新 / 刷新应用”可重新获取最新网页资源。'
      : '此设备当前通过浏览器访问。符合条件时可安装到桌面；安装后仍需联网使用服务器功能。';
    $('#appInstall').textContent = installed ? '已在应用模式中运行' : (installPrompt ? '⇩ 安装手机客户端' : '⇩ 查看安装选项');
    $('#appInstall').disabled = installed;
    $('#appInstall').style.opacity = installed ? '.65' : '1';
    $('#appHelp').textContent = installPrompt
      ? '浏览器已提供安装选项，可点击上方按钮继续。'
      : '若点击后没有安装弹窗，请使用 Chrome 菜单中的“安装应用”或“添加到主屏幕”。';
  };
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    updateState();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    updateState();
    $('#appHelp').textContent = '系统已报告安装完成。';
  });
  $('#appInstall').addEventListener('click', async () => {
    if (standalone()) return;
    if (!window.isSecureContext) {
      $('#appHelp').textContent = '安装需要 HTTPS 安全连接，请通过正式测试网址打开。';
      return;
    }
    if (installPrompt) {
      try {
        installPrompt.prompt();
        await installPrompt.userChoice;
      } catch (_) {
        $('#appHelp').textContent = '浏览器未能弹出安装窗口，请从浏览器菜单选择“安装应用”或“添加到主屏幕”。';
      } finally {
        installPrompt = null;
        updateState();
      }
      return;
    }
    $('#appHelp').textContent = /Android/i.test(navigator.userAgent)
      ? '在 Chrome 中点击右上角 ⋮ 菜单，选择“安装应用”；如果只有“添加到主屏幕”，也可以使用该选项。不同手机浏览器显示可能不同。'
      : '请打开浏览器的分享或菜单选项，查找“添加到主屏幕”或“安装应用”。';
  });
  $('#appRefresh').addEventListener('click', async () => {
    const button = $('#appRefresh');
    button.disabled = true;
    button.textContent = '正在检查…';
    try {
      const response = await fetch('/?app-check=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.update().catch(() => {})));
      }
      $('#appLatest').textContent = '已连接';
      $('#appUpdateText').textContent = '服务器已响应。将重新加载页面以获取当前可用版本；此操作不会删除聊天服务端历史记录。';
      setTimeout(() => location.reload(), 450);
    } catch (_) {
      $('#appUpdateText').textContent = '暂时无法连接服务器。请检查网络后重试；未更改本地或服务端数据。';
      button.disabled = false;
      button.textContent = '重新检查';
    }
  });
  updateState();
  window.addEventListener('pageshow', updateState);
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateState);
})();