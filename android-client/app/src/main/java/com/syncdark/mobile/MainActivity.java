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
import android.app.DownloadManager;
import android.os.Environment;
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
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null || !url.startsWith("https://syncdark-globe-test.onrender.com/api/download/android.apk")) {
                Toast.makeText(this, "为安全起见，仅允许下载官方测试 APK", Toast.LENGTH_LONG).show();
                return;
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle("暗域 SYNC Android 安装包");
                request.setDescription("正在下载测试版 APK");
                request.setMimeType("application/vnd.android.package-archive");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(false);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "syncdark-android-test.apk");
                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(this, "已开始下载；完成后请从通知栏打开 APK 安装", Toast.LENGTH_LONG).show();
            } catch (Exception error) {
                Toast.makeText(this, "无法开始下载，请在浏览器中打开测试站点重试", Toast.LENGTH_LONG).show();
            }
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
