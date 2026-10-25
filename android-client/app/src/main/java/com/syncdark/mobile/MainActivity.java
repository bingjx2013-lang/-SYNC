package com.syncdark.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.Uri;
import android.view.KeyEvent;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.view.ViewGroup;

public final class MainActivity extends Activity {
    private static final String APP_URL = "https://syncdark-globe-test.onrender.com/";
    private WebView webView;
    private TextView nodeStatus;
    private boolean receiverRegistered = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean pendingInstallAfterPermission = false;
    private volatile boolean updateDownloadRunning = false;
    private File pendingUpdateApk;

    private final BroadcastReceiver nodeReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (NodeMeshService.ACTION_STATUS.equals(intent.getAction()) && nodeStatus != null) {
                nodeStatus.setText(intent.getStringExtra(NodeMeshService.EXTRA_STATUS));
            }
        }
    };

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(android.graphics.Color.rgb(5, 5, 8));
        getWindow().setNavigationBarColor(android.graphics.Color.rgb(5, 5, 8));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(android.graphics.Color.rgb(8, 9, 14));

        TextView title = new TextView(this);
        title.setText("暗域 · SYNC  |  附近节点");
        title.setTextColor(android.graphics.Color.WHITE);
        title.setTextSize(16);
        title.setPadding(16, 12, 16, 4);
        root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        nodeStatus = new TextView(this);
        nodeStatus.setText("附近节点服务尚未启动。启动后将广播本机节点并发现同一局域网的 SYNC 设备。");
        nodeStatus.setTextColor(android.graphics.Color.LTGRAY);
        nodeStatus.setTextSize(12);
        nodeStatus.setPadding(16, 4, 16, 8);
        root.addView(nodeStatus, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        Button start = new Button(this);
        start.setText("启动节点");
        start.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4201);
            }
            try {
                Intent service = new Intent(this, NodeMeshService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service);
                else startService(service);
                nodeStatus.setText("正在启动节点服务…");
            } catch (Exception error) {
                nodeStatus.setText("启动失败：" + error.getClass().getSimpleName());
            }
        });
        Button stop = new Button(this);
        stop.setText("停止节点");
        stop.setOnClickListener(v -> {
            stopService(new Intent(this, NodeMeshService.class));
            nodeStatus.setText("节点服务已停止。");
        });
        controls.addView(start, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        controls.addView(stop, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(controls, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AndroidUpdaterBridge(), "SyncAndroidUpdater");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || !url.startsWith(APP_URL + "api/download/android.apk")) {
                Toast.makeText(this, "为安全起见，仅允许下载官方测试 APK", Toast.LENGTH_LONG).show();
                return;
            }
            Toast.makeText(this, "请使用页面中的“下载并安装”按钮，以显示真实进度并校验安装包。", Toast.LENGTH_LONG).show();
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equalsIgnoreCase(uri.getScheme()) && "syncdark-globe-test.onrender.com".equalsIgnoreCase(uri.getHost())) return false;
                if ("https".equalsIgnoreCase(uri.getScheme()) || "mailto".equalsIgnoreCase(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                    return true;
                }
                return true;
            }
        });
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        IntentFilter filter = new IntentFilter(NodeMeshService.ACTION_STATUS);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(nodeReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(nodeReceiver, filter);
        receiverRegistered = true;

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(APP_URL);
    }

    private final class AndroidUpdaterBridge {
        @JavascriptInterface public String getInstalledVersionInfo() {
            try {
                android.content.pm.PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
                JSONObject value = new JSONObject();
                value.put("versionName", info.versionName == null ? "unknown" : info.versionName);
                value.put("versionCode", code);
                return value.toString();
            } catch (Exception error) {
                return "{\"error\":\"version-unavailable\"}";
            }
        }

        @JavascriptInterface public void downloadAndInstall(String downloadUrl, String expectedSha256, int expectedVersionCode) {
            if (updateDownloadRunning) { reportProgress(0, "更新已经在下载中"); return; }
            if (downloadUrl == null || expectedSha256 == null ||
                    !downloadUrl.matches("^https://syncdark-globe-test\\.onrender\\.com/api/download/android\\.apk(?:\\?.*)?$") ||
                    !expectedSha256.matches("(?i)^[a-f0-9]{64}$") || expectedVersionCode <= 0) {
                reportProgress(0, "更新地址或校验信息无效");
                return;
            }
            try {
                android.content.pm.PackageInfo installed = getPackageManager().getPackageInfo(getPackageName(), 0);
                long current = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
                if (expectedVersionCode <= current) {
                    reportProgress(100, "当前已经是最新版本，无需更新");
                    return;
                }
            } catch (Exception ignored) {}
            updateDownloadRunning = true;
            new Thread(() -> performUpdateDownload(downloadUrl, expectedSha256.toLowerCase(Locale.ROOT), expectedVersionCode), "syncdark-updater").start();
        }

        @JavascriptInterface public void installPending() {
            mainHandler.post(() -> {
                File file = pendingUpdateApk;
                if (file != null && file.isFile()) launchPackageInstaller(file);
                else reportProgress(0, "还没有可安装的更新包");
            });
        }
    }

    private void performUpdateDownload(String address, String expectedSha256, int expectedVersionCode) {
        FileOutputStream output = null;
        HttpURLConnection connection = null;
        File temporary = null;
        try {
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) throw new Exception("无法访问应用下载目录");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建下载目录");
            File apk = new File(dir, "syncdark-update.apk");
            temporary = new File(dir, "syncdark-update.apk.part");
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new Exception("下载服务器返回 HTTP " + status);
            long total = connection.getContentLengthLong();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long received = 0;
            byte[] buffer = new byte[32768];
            try (InputStream input = connection.getInputStream()) {
                output = new FileOutputStream(temporary);
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    received += count;
                    int percent = total > 0 ? (int) Math.min(99, received * 100 / total) : -1;
                    reportProgress(percent, total > 0
                            ? String.format(Locale.ROOT, "正在下载更新：%.1f / %.1f MB", received / 1048576.0, total / 1048576.0)
                            : String.format(Locale.ROOT, "已下载 %.1f MB", received / 1048576.0));
                }
                output.flush();
            }
            output.close(); output = null;
            StringBuilder hash = new StringBuilder();
            for (byte b : digest.digest()) hash.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            if (!expectedSha256.equals(hash.toString())) throw new Exception("安装包 SHA-256 校验失败，已阻止安装");
            android.content.pm.PackageInfo archive = getPackageManager().getPackageArchiveInfo(temporary.getAbsolutePath(), 0);
            if (archive == null || !getPackageName().equals(archive.packageName)) throw new Exception("安装包不是暗域 SYNC 官方客户端");
            long archiveCode = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
            if (archiveCode != expectedVersionCode) throw new Exception("安装包版本号与服务器登记不一致");
            if (apk.exists() && !apk.delete()) throw new Exception("无法替换旧安装包");
            if (!temporary.renameTo(apk)) throw new Exception("无法保存已下载的安装包");
            pendingUpdateApk = apk;
            reportProgress(100, "下载与完整性校验完成，正在打开系统安装界面…");
            mainHandler.post(() -> launchPackageInstaller(apk));
        } catch (Exception error) {
            if (temporary != null && temporary.exists()) temporary.delete();
            reportProgress(0, "更新失败：" + (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage()));
        } finally {
            updateDownloadRunning = false;
            if (output != null) try { output.close(); } catch (Exception ignored) {}
            if (connection != null) connection.disconnect();
        }
    }

    private void reportProgress(int percent, String status) {
        mainHandler.post(() -> {
            if (webView == null) return;
            String safe = JSONObject.quote(status == null ? "" : status);
            webView.evaluateJavascript("window.syncAndroidDownloadProgress && window.syncAndroidDownloadProgress(" +
                    percent + "," + safe + ")", null);
        });
    }

    private void launchPackageInstaller(File apk) {
        if (apk == null || !apk.isFile()) { reportProgress(0, "安装包不存在，请重新下载"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            pendingInstallAfterPermission = true;
            reportProgress(100, "下载完成。请允许本应用安装未知应用，返回后会继续打开安装界面。");
            try {
                Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName()));
                startActivity(settings);
            } catch (Exception error) {
                pendingInstallAfterPermission = false;
                Toast.makeText(this, "请在系统设置中允许“暗域 · SYNC”安装未知应用", Toast.LENGTH_LONG).show();
            }
            return;
        }
        pendingInstallAfterPermission = false;
        try {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
            reportProgress(100, "已打开 Android 系统安装界面，请确认安装");
        } catch (Exception error) {
            reportProgress(100, "安装包已下载。请稍后点“安装已下载的更新”重试：" + error.getClass().getSimpleName());
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (pendingInstallAfterPermission && Build.VERSION.SDK_INT >= 26 &&
                getPackageManager().canRequestPackageInstalls() && pendingUpdateApk != null) {
            pendingInstallAfterPermission = false;
            mainHandler.postDelayed(() -> launchPackageInstaller(pendingUpdateApk), 350);
        }
    }

    @Override protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override protected void onDestroy() {
        if (receiverRegistered) {
            try { unregisterReceiver(nodeReceiver); } catch (Exception ignored) {}
        }
        if (webView != null) { webView.stopLoading(); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
