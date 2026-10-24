# 暗域 · SYNC

实时聊天服务（Node.js + WebSocket）+ 可安装的 PWA 客户端。
- 服务端：`server.js`，房间、在线人数、最近 50 条历史（仅内存）、限流。
- 客户端：`public/`，Android Chrome 可安装，iOS Safari 可添加到主屏幕。
- 加密：设置房间密钥后，消息在设备上用 AES-256-GCM 加密，服务器只看到密文。

## 部署到 Render
1. 把本目录推到一个 GitHub 仓库。
2. Render 控制台：New → Blueprint（读取 render.yaml）或 New → Web Service，
   Build Command: `npm install`，Start Command: `node server.js`。
3. 部署完成后，访问 `https://<你的服务名>.onrender.com`。

注意：Free 套餐闲置约 15 分钟会休眠，首次访问需等待唤醒；历史消息在重启后会清空。

## 安装到手机
- Android 8+：用 Chrome 打开网址 →「安装应用 / 添加到主屏幕」。
- iPhone：用 Safari 打开网址 → 分享 →「添加到主屏幕」。

## 本地运行
```
npm install
npm start    # http://localhost:3000
```
