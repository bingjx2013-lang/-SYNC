# 暗域 · SYNC Android 四段式版本规则

正式版本统一写作 vA.B.C.D，不再使用 -mesh1 这样的后缀。

- A：主版本。发生大版本升级时加 1，例如 v4.1.0.0 → v5.1.0.0。
- B：功能版本。每新增一项功能加 1，例如 v4.1.0.0 → v4.2.0.0。
- C：累计修复批次，每累计修复 5 个 Bug 加 1。
- D：累计 Bug 修复数除以 5 的余数，范围为 0–4。

例如，当前功能版本为 v0.6.0.0；同一功能版本累计修复 13 个 Bug 后，版本会成为 v0.6.2.3。版本号必须保持四段，不能把网页服务版本当成手机已安装版本。

Android versionCode 必须单调递增，不能只直接拼接四段数字。项目采用：
A × 100000000 + B × 1000000 + C × 1000 + D。
例如 v0.6.0.0 对应 versionCode 6000000，确保此版本高于既有的旧构建号 3333。发布流程需同时校验版本名称、构建号、APK SHA-256 与文件大小；客户端只在目标 versionCode 更高时执行更新，阻止降级。

## 安装与更新行为

网站浏览器会显示真实下载进度、验证下载长度和 SHA-256，并开始下载 APK。浏览器网页无法绕过 Android 安装确认。Android 客户端使用原生下载器显示进度，校验 SHA-256、包名及 APK 内的版本号后，自动打开系统安装界面；首次安装/更新时，Android 仍可能要求用户允许该应用安装未知应用并确认安装。应用不会静默安装，也不会改动服务器数据库。


## 真实 APK 更新发布流程

- 服务端从公开 GitHub Releases 读取发布项，只接受四段式版本标签，并要求同一 Release 中同时存在 `syncdark-android.apk` 和 `android-version.json`。
- 版本清单必须与 Release 标签、APK 文件大小、正整数 `versionCode`、SHA-256 和发布日期相符；服务端下载 APK 后还会重新计算 SHA-256，校验失败会拒绝返回安装包。
- 没有合格的 Release 时，`/api/android/version` 会返回 `503` 和 `release_not_published`，不会伪造“发现更新”或下载成功状态。
- `.github/workflows/android-publish-test-release.yml` 是手动触发的**测试预发布**工作流，只允许从 `feat/android-mesh-native-2026-10` 分支运行。它会重新构建并验证签名 APK，然后发布带校验清单的 GitHub prerelease；不会部署 Render 服务或修改数据库。
- 要发布下一个版本，先提升 `android-client/app/build.gradle` 中的四段式 `versionName` 和单调递增的 `versionCode`，确保不与现有标签冲突。版本发布后，还需要在经过验证并获批准的服务器分支部署更新接口；功能分支上的修改不会自动改变当前线上服务。
