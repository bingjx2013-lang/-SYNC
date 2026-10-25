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

## 安全事件历史（测试分支）
- 安全监测页面支持按风险等级和事件类型筛选，并可导出 JSON。
- 未配置 `DATABASE_URL` 时，事件仅保留在当前进程内存，最多保留 250 条；服务重启/休眠后可能清空。
- 配置 PostgreSQL 的 `DATABASE_URL` 后，服务会自动创建 `sync_security_events` 表，并将新观察到的安全事件写入数据库；`/api/security` 可读取历史事件。
- 连接字符串请只添加到 Render 测试服务的环境变量中，不要提交到 GitHub，也不要放进前端代码。
- Render Free Postgres 会在 30 天后到期，且不提供备份，不适合保存重要的长期安全记录。创建数据库前应先确认计划并设置备份方案。

## 运行态诊断（只读）
- 新增 `GET /api/ops`，汇总 Redis/PostgreSQL 配置与连接状态、WebSocket 在线连接和房间数、进程内存、网络探测缓存、CISA 威胁情报缓存及当前进程的安全事件计数。
- 响应使用 `Cache-Control: no-store`，不返回数据库/Redis 连接字符串、原始 IP、聊天内容或内部 Redis 历史键；安全事件计数明确标注为当前进程内存范围，不冒充数据库总历史。
- 这是诊断接口，不会修改 Redis、数据库或环境变量。

## 安装到手机
- Android 8+：用 Chrome 打开网址 →「安装应用 / 添加到主屏幕」。
- iPhone：用 Safari 打开网址 → 分享 →「添加到主屏幕」。

## 本地运行
```
npm install
npm start    # http://localhost:3000
```
