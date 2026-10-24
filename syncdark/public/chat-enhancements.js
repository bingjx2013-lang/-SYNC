(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const panel = $('#comms .panel');
  const chatlog = $('#chatlog');
  if (!panel || !chatlog || $('#chatEnhancements')) return;

  const toolbar = document.createElement('div');
  toolbar.id = 'chatEnhancements';
  toolbar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);background:#070b12';
  const hint = document.createElement('span');
  hint.className = 'tiny';
  hint.style.cssText = 'flex:1;min-width:140px';
  hint.textContent = '聊天增强：可导出当前记录，或开启后台消息提醒。';
  const notifyBtn = document.createElement('button');
  notifyBtn.className = 'btn';
  notifyBtn.type = 'button';
  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.type = 'button';
  exportBtn.textContent = '导出聊天记录';
  const unreadBtn = document.createElement('button');
  unreadBtn.className = 'btn';
  unreadBtn.type = 'button';
  unreadBtn.textContent = '清零未读';
  toolbar.append(hint, notifyBtn, exportBtn, unreadBtn);
  chatlog.parentNode.insertBefore(toolbar, chatlog);

  let notificationsOn = false;
  let unread = 0;
  const saved = (() => { try { return localStorage.getItem('sync-chat-notifications') === 'on'; } catch (_) { return false; } })();
  const updateNotifyButton = () => {
    notifyBtn.textContent = notificationsOn ? '关闭后台提醒' : '开启后台提醒';
    notifyBtn.style.color = notificationsOn ? 'var(--green)' : 'var(--cyan)';
  };
  const updateUnread = () => {
    document.title = unread ? '(' + unread + ') 暗域 · SYNC / 控制台' : '暗域 · SYNC / 控制台';
    unreadBtn.textContent = unread ? '清零未读 (' + unread + ')' : '清零未读';
  };
  notifyBtn.addEventListener('click', async () => {
    if (notificationsOn) {
      notificationsOn = false;
      try { localStorage.setItem('sync-chat-notifications', 'off'); } catch (_) {}
      hint.textContent = '后台消息提醒已关闭。';
      updateNotifyButton();
      return;
    }
    if (!('Notification' in window)) {
      hint.textContent = '此浏览器不支持系统通知；聊天与导出功能仍可使用。';
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      try { permission = await Notification.requestPermission(); } catch (_) { permission = 'denied'; }
    }
    notificationsOn = permission === 'granted';
    try { localStorage.setItem('sync-chat-notifications', notificationsOn ? 'on' : 'off'); } catch (_) {}
    hint.textContent = notificationsOn ? '后台消息提醒已开启；仅在页面位于后台时提醒。' : '通知权限未授予，可在浏览器网站设置中开启。';
    updateNotifyButton();
  });
  exportBtn.addEventListener('click', () => {
    const lines = Array.from(chatlog.children).map((el) => (el.innerText || el.textContent || '').trim()).filter(Boolean);
    if (!lines.length) { hint.textContent = '当前没有可导出的聊天记录。'; return; }
    const room = ($('#roomLabel')?.textContent || 'chat').replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 60) || 'chat';
    const content = '\uFEFF暗域 · SYNC 聊天记录\n房间：' + room + '\n导出时间：' + new Date().toLocaleString() + '\n\n' + lines.join('\n\n') + '\n';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SYNC-chat-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    hint.textContent = '已生成当前聊天窗口记录的文本导出文件。';
  });
  unreadBtn.addEventListener('click', () => { unread = 0; updateUnread(); });
  notificationsOn = saved && ('Notification' in window) && Notification.permission === 'granted';
  updateNotifyButton(); updateUnread();

  if (typeof window.chatAdd === 'function') return;
  // The existing chatAdd is a top-level function declaration, so wrap it for optional background alerts.
  const originalChatAdd = window.chatAdd;
  if (typeof originalChatAdd === 'function') {
    window.chatAdd = function(name, message, ts, mine, sys) {
      originalChatAdd(name, message, ts, mine, sys);
      if (!sys && !mine && document.visibilityState === 'hidden') {
        unread++; updateUnread();
        if (notificationsOn && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const note = new Notification('暗域 · SYNC — ' + String(name || '新消息').slice(0, 40), {
              body: String(message || '').slice(0, 180),
              tag: 'sync-chat-' + ($('#room')?.value || 'room'),
              silent: true
            });
            note.onclick = () => { window.focus(); note.close(); };
          } catch (_) {}
        }
      }
    };
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { unread = 0; updateUnread(); } });
})();