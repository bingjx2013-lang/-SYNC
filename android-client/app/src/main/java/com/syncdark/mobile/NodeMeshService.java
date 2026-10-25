package com.syncdark.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class NodeMeshService extends Service {
    public static final String ACTION_STATUS = "com.syncdark.mobile.NODE_STATUS";
    public static final String EXTRA_STATUS = "status";
    public static final String EXTRA_PEERS_JSON = "peers_json";
    private static volatile String latestSnapshot = "{\"running\":false,\"status\":\"附近节点服务尚未启动\",\"peers\":[]}";
    private static final String CHANNEL = "syncdark_mesh";
    private static final int NOTIFICATION_ID = 39473;
    private static final String SERVICE_TYPE = "_syncdark._tcp.";
    private static final int PORT = 39473;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private NsdManager nsd;
    private NsdManager.RegistrationListener registration;
    private NsdManager.DiscoveryListener discovery;
    private WifiManager.MulticastLock multicastLock;
    private ServerSocket server;
    private String nodeId;
    private volatile int peers = 0;
    private final java.util.Set<String> handshakenServices = java.util.concurrent.ConcurrentHashMap.newKeySet();
    private final Map<String, PeerRecord> discoveredPeers = new ConcurrentHashMap<>();
    private volatile String currentStatus = "附近节点服务尚未启动";

    private static final class PeerRecord {
        final String name, host;
        final int port;
        final long seenAt;
        PeerRecord(String name, String host, int port, long seenAt) {
            this.name = name; this.host = host; this.port = port; this.seenAt = seenAt;
        }
    }

    public static String getSnapshotJson() { return latestSnapshot; }

    private void publishSnapshot() {
        try {
            JSONObject root = new JSONObject();
            root.put("running", running.get());
            root.put("status", currentStatus);
            root.put("nodeId", nodeId == null ? "" : nodeId);
            root.put("checkedAt", System.currentTimeMillis());
            JSONArray list = new JSONArray();
            for (PeerRecord peer : discoveredPeers.values()) {
                JSONObject item = new JSONObject();
                item.put("name", peer.name);
                item.put("host", peer.host);
                item.put("port", peer.port);
                item.put("lastSeen", peer.seenAt);
                item.put("protocol", 1);
                item.put("capabilities", new JSONArray().put("discovery").put("lan-handshake"));
                list.put(item);
            }
            root.put("peers", list);
            latestSnapshot = root.toString();
        } catch (Exception ignored) {
            latestSnapshot = "{\"running\":" + running.get() + ",\"status\":\"状态暂不可用\",\"peers\":[]}";
        }
    }

    @Override public void onCreate() {
        super.onCreate();
        nsd = (NsdManager) getSystemService(NSD_SERVICE);
        nodeId = getSharedPreferences("syncdark_node", MODE_PRIVATE)
                .getString("node_id", null);
        if (nodeId == null) {
            nodeId = UUID.randomUUID().toString();
            getSharedPreferences("syncdark_node", MODE_PRIVATE).edit().putString("node_id", nodeId).apply();
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();
        startForeground(NOTIFICATION_ID, notification("正在启动附近节点发现…"));
        if (running.compareAndSet(false, true)) {
            try {
                WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wifi != null) {
                    multicastLock = wifi.createMulticastLock("syncdark-node-discovery");
                    multicastLock.setReferenceCounted(false);
                    multicastLock.acquire();
                }
            } catch (Exception ignored) {}
            startTcpListener();
            registerService();
            discoverServices();
        }
        return START_STICKY;
    }

    private void startTcpListener() {
        io.execute(() -> {
            try (ServerSocket listener = new ServerSocket(PORT)) {
                server = listener;
                while (running.get()) {
                    Socket socket = listener.accept();
                    io.execute(() -> handlePeer(socket));
                }
            } catch (Exception error) {
                if (running.get()) broadcastStatus("局域网监听不可用：" + error.getClass().getSimpleName());
            }
        });
    }

    private void handlePeer(Socket socket) {
        try (Socket peer = socket) {
            peer.setSoTimeout(2500);
            BufferedReader input = new BufferedReader(new InputStreamReader(peer.getInputStream(), StandardCharsets.UTF_8));
            OutputStream output = peer.getOutputStream();
            String command = input.readLine();
            if ("SYNC_HELLO".equals(command)) {
                String response = "{\"protocol\":1,\"nodeId\":\"" + nodeId + "\",\"capabilities\":[\"discovery\",\"lan-handshake\"],\"ts\":" + System.currentTimeMillis() + "}\n";
                output.write(response.getBytes(StandardCharsets.UTF_8));
                output.flush();
            }
        } catch (Exception ignored) {}
    }

    private void registerService() {
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName("SYNC-" + nodeId.substring(0, 8));
        info.setServiceType(SERVICE_TYPE);
        info.setPort(PORT);
        registration = new NsdManager.RegistrationListener() {
            @Override public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                broadcastStatus("节点广播失败（" + errorCode + "）");
            }
            @Override public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {}
            @Override public void onServiceRegistered(NsdServiceInfo serviceInfo) {
                broadcastStatus("已广播本机节点；正在发现附近设备");
            }
            @Override public void onServiceUnregistered(NsdServiceInfo serviceInfo) {}
        };
        try { nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, registration); }
        catch (Exception error) { broadcastStatus("节点广播暂不可用"); }
    }

    private void discoverServices() {
        discovery = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String type) { broadcastStatus("正在扫描同一局域网的 SYNC 节点…"); }
            @Override public void onStartDiscoveryFailed(String type, int code) {
                broadcastStatus("附近节点发现失败（" + code + "）");
                try { nsd.stopServiceDiscovery(this); } catch (Exception ignored) {}
            }
            @Override public void onStopDiscoveryFailed(String type, int code) {}
            @Override public void onDiscoveryStopped(String type) {}
            @Override public void onServiceFound(NsdServiceInfo serviceInfo) {
                if (serviceInfo.getServiceName() != null && serviceInfo.getServiceName().startsWith("SYNC-")) {
                    try { nsd.resolveService(serviceInfo, new NsdManager.ResolveListener() {
                        @Override public void onResolveFailed(NsdServiceInfo info, int code) {}
                        @Override public void onServiceResolved(NsdServiceInfo info) {
                            if (info.getServiceName().equals("SYNC-" + nodeId.substring(0, 8))) return;
                            probePeer(info);
                        }
                    }); } catch (Exception ignored) {}
                }
            }
            @Override public void onServiceLost(NsdServiceInfo serviceInfo) {
                String name = serviceInfo.getServiceName();
                if (name != null && handshakenServices.remove(name)) {
                    synchronized (NodeMeshService.this) { peers = Math.max(0, peers - 1); }
                    discoveredPeers.remove(name);
                }
                broadcastStatus("附近节点发生变化");
            }
        };
        try { nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discovery); }
        catch (Exception error) { broadcastStatus("附近节点发现暂不可用"); }
    }

    private void probePeer(NsdServiceInfo info) {
        io.execute(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new java.net.InetSocketAddress(info.getHost(), info.getPort()), 1800);
                socket.setSoTimeout(1800);
                socket.getOutputStream().write("SYNC_HELLO\n".getBytes(StandardCharsets.UTF_8));
                socket.getOutputStream().flush();
                BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                String response = reader.readLine();
                if (response != null && response.contains("\"protocol\":1") && !response.contains("\"" + nodeId + "\"")) {
                    String peerName = info.getServiceName();
                    if (peerName != null) {
                        boolean isNew = handshakenServices.add(peerName);
                        if (isNew) synchronized (NodeMeshService.this) { peers = Math.min(999, peers + 1); }
                        String host = info.getHost() == null ? "" : info.getHost().getHostAddress();
                        discoveredPeers.put(peerName, new PeerRecord(peerName, host, info.getPort(), System.currentTimeMillis()));
                        broadcastStatus("已发现可连接的 SYNC 节点：" + peerName + "；当前已连接节点 " + peers + " 台");
                        updateNotification("已发现 SYNC 节点；本机正在提供局域网握手服务");
                    }
                }
            } catch (Exception ignored) {}
        });
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(
                    new NotificationChannel(CHANNEL, "SYNC 附近节点", NotificationManager.IMPORTANCE_LOW));
        }
    }

    private Notification notification(String text) {
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return builder.setContentTitle("暗域 · SYNC 节点服务")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true).build();
    }

    private void updateNotification(String text) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification(text));
    }

    private void broadcastStatus(String status) {
        currentStatus = status == null ? "" : status;
        publishSnapshot();
        Intent intent = new Intent(ACTION_STATUS);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_STATUS, currentStatus);
        intent.putExtra(EXTRA_PEERS_JSON, latestSnapshot);
        sendBroadcast(intent);
        updateNotification(currentStatus);
    }

    @Override public void onDestroy() {
        running.set(false);
        handshakenServices.clear();
        discoveredPeers.clear();
        peers = 0;
        currentStatus = "附近节点服务已停止";
        publishSnapshot();
        Intent stopped = new Intent(ACTION_STATUS);
        stopped.setPackage(getPackageName());
        stopped.putExtra(EXTRA_STATUS, currentStatus);
        stopped.putExtra(EXTRA_PEERS_JSON, latestSnapshot);
        sendBroadcast(stopped);
        try { stopForeground(true); } catch (Exception ignored) {}
        try { if (server != null) server.close(); } catch (Exception ignored) {}
        try { if (discovery != null) nsd.stopServiceDiscovery(discovery); } catch (Exception ignored) {}
        try { if (registration != null) nsd.unregisterService(registration); } catch (Exception ignored) {}
        try { if (multicastLock != null && multicastLock.isHeld()) multicastLock.release(); } catch (Exception ignored) {}
        io.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
