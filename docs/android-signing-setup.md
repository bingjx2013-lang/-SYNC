# 暗域 · SYNC Android 固定签名与 APK 更新

> 本文只配置签名，不会自动运行发布。仓库的 `feature/live-refresh-3d-globe` 分支连接着 Render 网站；运行发布工作流可能向该分支提交 APK 并触发网站部署。请在准备正式更新网站时再手动运行。

## 为什么需要固定签名

Android 只有在应用包名相同、签名证书兼容且版本号递增时，才能把新 APK 作为旧应用更新。临时 Debug 签名可能每次不同，因此本项目不会把临时 Debug APK 自动放到网页固定下载按钮后面。

固定下载入口保持为：

- APK：`/api/download/android.apk`
- 版本清单：`/api/android/version`

每次成功发布时，工作流会把 APK 和版本清单一起提交。网页会重新读取 APK 的版本名、构建号、文件大小、发布时间和 SHA-256。网站不能绕过 Android 安装确认来静默更新手机上的 App。

## 方案 A：只用 Android 手机和 Termux 生成签名

### 1. 安装 keytool

在 Termux 输入：

```bash
pkg update
pkg install openjdk-17
keytool -help
```

如果提示找不到 `openjdk-17`，运行 `pkg search openjdk`，选择仓库中可用的 JDK 包后再试。最后一条命令能显示 keytool 帮助，说明工具已安装。

### 2. 创建长期固定的签名密钥

复制执行：

```bash
keytool -genkeypair -v -storetype JKS -keystore "$HOME/syncdark-release.jks" -alias syncdark-release -keyalg RSA -keysize 3072 -validity 10000
```

按提示创建强密码并填写证书资料。请记下 KeyStore 密码和私钥密码；在输入私钥密码时直接按回车，可让它与 KeyStore 密码相同。不要把密码发给我、放进代码或粘贴到聊天里。

确认文件存在：

```bash
ls -l "$HOME/syncdark-release.jks"
```

### 3. 备份密钥

丢失或更换这把密钥，可能导致后续 APK 无法覆盖本手机已安装的版本。请至少保留两份安全备份，并记住密码。可在 Termux 中申请共享存储权限后，把加密的 JKS 文件备份到手机文件夹：

```bash
termux-setup-storage
mkdir -p "$HOME/storage/shared/Download"
cp "$HOME/syncdark-release.jks" "$HOME/storage/shared/Download/syncdark-release-backup.jks"
```

JKS 文件受密码保护，但共享下载目录可能被其他应用读取；请使用强密码，不要把它上传到公开网盘、Git 仓库或 Issue。至少另存一份到你控制的安全位置。

### 4. 将签名信息写入 GitHub Secrets

手机浏览器打开 GitHub 仓库 `bingjx2013-lang/-SYNC`，进入 **Settings → Secrets and variables → Actions → New repository secret**，依次新增这四项：

| Secret 名称 | 填写内容 |
|---|---|
| `SYNCDARK_ANDROID_KEYSTORE_BASE64` | JKS 文件的 Base64 全文 |
| `SYNCDARK_ANDROID_KEYSTORE_PASSWORD` | 创建 KeyStore 时设置的密码 |
| `SYNCDARK_ANDROID_KEY_ALIAS` | `syncdark-release` |
| `SYNCDARK_ANDROID_KEY_PASSWORD` | 该 alias 的私钥密码 |

生成 Base64 内容时，优先使用 Termux 剪贴板命令，避免把整段内容显示在屏幕上：

```bash
pkg install termux-api
base64 "$HOME/syncdark-release.jks" | tr -d '\n' | termux-clipboard-set
```

此命令需要已安装并可用的 Termux:API 配套应用。如果系统提示找不到 `termux-clipboard-set`，先确认 Termux:API 配套应用已安装；也可以把 Base64 输出重定向到自己私有目录里的文本文件，再通过安全方式复制。不要把 Base64 内容发到聊天、提交、Issue 或普通仓库变量。

### 5. 什么时候运行发布工作流

**先不要急着点运行。** 当前发布工作流只允许在 `feature/live-refresh-3d-globe` 分支上执行；成功后会把签名 APK 和版本清单提交回该分支，可能触发 Render 网站部署并替换固定下载地址的文件。

当你确认准备发布新版时，再打开 **Actions → Android Client APK → Run workflow**，选择 `feature/live-refresh-3d-globe` 分支。工作流会检查四个 Secrets、构建 Release APK、验证签名、计算 SHA-256 和文件大小，然后发布 APK 与清单。如果 Secrets 缺少任何一项，工作流会失败并停止发布。

发布后，网页“下载安卓客户端”区域的“可下载版本”应显示 APK 自身的版本名、构建号、大小和发布时间。这个版本信息不同于网页服务版本。Android 安装仍需你在手机上确认。

## 手机里已经安装旧版时的注意事项

如果已安装的 `com.syncdark.mobile` 来自另一把临时 Debug 签名，新固定签名 APK 可能不能直接覆盖安装。Android 会因签名不匹配而阻止更新。不要为了试错直接清除 App 数据或卸载应用；先备份需要的数据，再决定如何迁移。以后所有版本都必须继续使用同一份 `syncdark-release.jks`。
