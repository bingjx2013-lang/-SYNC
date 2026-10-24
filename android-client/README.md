# 暗域 · SYNC Android 客户端（测试版）

这是一个可安装的 Android 应用外壳，使用原生 Android Activity/WebView 打开测试服务：
`https://syncdark-globe-test.onrender.com/`

- 应用 ID：`com.syncdark.mobile`
- 当前版本：`0.2.17`
- 最低 Android：Android 6.0（API 23）
- 所有网页内容通过 HTTPS 加载；不允许混合内容或本地文件访问。
- 此版本仍依赖网络和测试服务器，不是离线版；服务器仍然可用时才可正常使用在线功能。
- 此 APK 是测试构建，未使用发布签名，不应作为正式发布包分发。
- 正式服务、正式数据库和备份不会由此项目更改。

## 构建
在 GitHub Actions 的 Android Client APK workflow 中运行构建，下载 `app-debug.apk` 测试安装。
