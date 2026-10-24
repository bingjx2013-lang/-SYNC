# 暗域 SYNC Android APK 固定签名配置

> 本文只适用于测试分支 `feature/live-refresh-3d-globe`。不要把签名私钥、密码或 Base64 密钥写进 Git 仓库、聊天或日志。

## 为什么需要这一步

旧工作流使用 `assembleDebug`。GitHub Actions 每次在新的临时运行器上执行时，Android 可能生成不同的调试签名证书；这会使新版 APK 无法覆盖由另一个证书签名的同包名旧版。现在的工作流已改为：**只有配置持久签名密钥后，才能构建并发布可下载 APK**。

## 1. 在可信任的电脑上创建固定签名密钥

需要安装 JDK（包含 `keytool`）。在一个安全的私有目录里执行：

```bash
keytool -genkeypair -v -keystore syncdark-release.jks -alias syncdark-release -keyalg RSA -keysize 3072 -validity 10000
```

按提示设置强密码，并填写证书资料。记下 KeyStore 密码、Key Alias（`syncdark-release`）和 Key 密码。若生成时对 Key 密码直接回车，Key 密码与 KeyStore 密码相同。

**请把 `syncdark-release.jks` 至少备份到两个安全位置。丢失这把密钥会导致后续版本无法作为同一签名应用更新。不要提交这个文件到 Git。**

## 2. 将密钥放进 GitHub Actions Secrets

打开仓库的 **Settings → Secrets and variables → Actions → New repository secret**，逐个新增下列 4 个 Secret：

- `SYNCDARK_ANDROID_KEYSTORE_BASE64`：签名文件的 Base64 全文（不是文件路径）。
- `SYNCDARK_ANDROID_KEYSTORE_PASSWORD`：创建 KeyStore 时输入的密码。
- `SYNCDARK_ANDROID_KEY_ALIAS`：`syncdark-release`。
- `SYNCDARK_ANDROID_KEY_PASSWORD`：该 alias 对应的私钥密码。

Base64 编码方式：

**Windows PowerShell：**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\syncdark-release.jks")) | Set-Clipboard
```
将剪贴板里的完整内容粘贴到 `SYNCDARK_ANDROID_KEYSTORE_BASE64` 的 Secret 值中。

**macOS / Linux：**
```bash
base64 < syncdark-release.jks | tr -d '\n'
```
复制完整输出到 `SYNCDARK_ANDROID_KEYSTORE_BASE64` 的 Secret 值中。

不要把 Base64 内容粘贴到聊天、Issue、提交记录或普通仓库变量中。

## 3. 构建并检查

配置完 4 个 Secrets 后，进入 Actions → Android Client APK，运行工作流。它会构建 release APK，使用 Android 的 `apksigner` 校验签名，再发布到测试站点。未配置 Secrets 时，工作流会失败并停止发布；这是有意设置的安全闸门。

构建成功后，在手机安装前先核对应用版本显示为 `0.3.3.2`，并查看工作流日志中的 signer certificate SHA-256。以后所有更新必须保留同一份 `syncdark-release.jks`。

## 4. 关于手机上已有的旧版

如果手机中已安装的 `com.syncdark.mobile` 是先前某次临时 Debug 签名构建版，新固定签名 APK 仍可能不能覆盖它，因为签名证书不同。Android 不允许在签名不匹配时直接升级。请先备份任何需要的数据，再决定是否卸载旧版后安装固定签名版；不要为了试错而直接清除应用数据。

当前公开下载地址不会继续提供未经固定签名验证的旧 Debug APK。
