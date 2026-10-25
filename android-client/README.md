# 暗域 · SYNC Android 客户端（节点功能开发版）

这是原有 PWA 的 Android 原生外壳升级版。PWA 仍在 WebView 中打开测试服务：
`https://syncdark-globe-test.onrender.com/`

- 应用 ID：`com.syncdark.mobile`
- 最低 Android：Android 6.0（API 23）
- 网页内容仍通过 HTTPS 加载；禁止混合内容与本地文件访问。
- **附近节点发现**：用户点按“启动节点”后，使用 Android NSD/DNS-SD 发现同一局域网中广播 `_syncdark._tcp` 的 SYNC 节点。
- **本机 LAN 节点**：在前台服务中监听 TCP 端口 `39473`，通过有限的 `SYNC_HELLO` 握手报告协议版本和随机节点 ID；不会扫描非 SYNC 服务，也不发送聊天记录。
- **后台运行**：由用户显式启动的前台服务和常驻通知维持节点监听；用户可以点“停止节点”关闭。Android 厂商省电策略仍可能限制后台运行。
- **公网连接**：现有聊天仍通过 HTTPS/WSS 测试服务转发；这版尚未实现手机之间的 NAT 穿透、全球节点路由或端到端节点消息中继。LAN 发现也不代表自动获得公网可达地址。
- **隐私**：不自动加入 Wi-Fi，不读取或保存 Wi-Fi 密码，不上传位置；本地节点 ID 保存在应用私有偏好设置中。
- 这是开发版，不能视为已通过运行测试的正式 APK。签名发布流程与原有 PWA 服务保持独立。

## 构建与测试

对本分支创建的 Pull Request 会运行 `.github/workflows/android-mesh-ci.yml`，编译 Debug APK 并将其作为 GitHub Actions artifact 保存 14 天。该工作流只读仓库，不需要签名密钥，不会向 Render 分支推送 APK，也不会部署生产环境。

## 后续阶段

1. 在两台同一 Wi-Fi 的 Android 设备上实测发现和握手。
2. 加入带身份认证与端到端加密的 LAN 消息协议，避免匿名节点注入消息。
3. 设计经用户同意的公网中继/信令方案，再实现 WebRTC/NAT 穿透；中继节点不应看到明文消息。
