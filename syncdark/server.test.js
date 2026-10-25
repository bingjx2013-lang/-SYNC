const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');

let child,baseUrl;
async function freePort(){
  return await new Promise((resolve,reject)=>{
    const s=net.createServer();
    s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(err=>err?reject(err):resolve(p))});
  });
}
async function waitForServer(){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error('server exited before becoming ready');
    try{const r=await fetch(baseUrl+'/healthz');if(r.ok)return}catch{}
    await new Promise(r=>setTimeout(r,150));
  }
  throw new Error('server did not become ready in 10 seconds');
}
before(async()=>{
  const port=await freePort();
  baseUrl='http://127.0.0.1:'+port;
  child=spawn(process.execPath,[path.join(__dirname,'server.js')],{
    cwd:__dirname,env:{...process.env,PORT:String(port)},stdio:'ignore'
  });
  await waitForServer();
});
after(()=>{if(child&&!child.killed)child.kill('SIGTERM')});

test('health endpoint responds with ok',async()=>{
  const r=await fetch(baseUrl+'/healthz');
  assert.equal(r.status,200);
  assert.equal(await r.text(),'ok');
});
test('status endpoint returns process metrics and disables caching',async()=>{
  const r=await fetch(baseUrl+'/api/status?version-check='+Date.now(),{cache:'no-store'});
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-type')||'',/application\/json/);
  assert.equal(r.headers.get('cache-control'),'no-store');
  const s=await r.json();
  for(const key of ['uptimeSeconds','cpuPercent','rssMb','heapUsedMb','heapTotalMb','connectedClients','rooms','timestamp'])assert.ok(key in s,'missing '+key);
  assert.ok(s.uptimeSeconds>=0);
  assert.ok(s.cpuPercent>=0&&s.cpuPercent<=100);
  assert.ok(s.rssMb>0);
  assert.equal(s.connectedClients,0);
});
test('APK download endpoint handles HEAD efficiently and rejects other methods',async()=>{
  const head=await fetch(baseUrl+'/api/download/android.apk',{method:'HEAD',cache:'no-store'});
  assert.ok([200,404,503].includes(head.status));
  assert.equal(head.headers.get('cache-control'),'no-store');
  assert.equal(await head.text(),'');
  const post=await fetch(baseUrl+'/api/download/android.apk',{method:'POST'});
  assert.equal(post.status,405);
  assert.match(post.headers.get('allow')||'',/GET/);
  assert.equal(post.headers.get('cache-control'),'no-store');
});

test('Android APK version metadata is explicit and never cached',async()=>{
  const r=await fetch(baseUrl+'/api/android/version?check='+Date.now());
  assert.match(r.headers.get('content-type')||'',/application\/json/);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.ok([200,503].includes(r.status));
  const data=await r.json();
  if(r.status===200){
    assert.equal(data.status,'available');
    assert.match(data.versionName,/^v\d+\.\d+\.\d+\.\d+$/,'APK version must follow vA.B.C.D');
    assert.ok(Number.isSafeInteger(data.versionCode)&&data.versionCode>0);
    assert.match(data.sha256,/^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(data.sizeBytes)&&data.sizeBytes>0);
    assert.equal(data.downloadUrl,'/api/download/android.apk');
    assert.match(data.releaseTag,/^v\d+\.\d+\.\d+\.\d+$/);
    assert.match(data.releaseUrl,/^https:\/\/github\.com\/bingjx2013-lang\/-SYNC\/releases\/tag\//);
    assert.ok(Number.isFinite(Date.parse(data.publishedAt)));
  }else{
    assert.equal(data.status,'unavailable');
    assert.ok(['release_not_published','release_service_unavailable'].includes(data.code));
    assert.ok(data.error);
  }
});

test('PWA manifest, service worker, and icons are served',async()=>{
  for(const [url,type] of [['/manifest.webmanifest',/application\/manifest\+json/],['/sw.js',/javascript/],['/icon-192.png',/image\/png/],['/icon-512.png',/image\/png/]]){
    const r=await fetch(baseUrl+url);
    assert.equal(r.status,200,url+' should be served');
    assert.match(r.headers.get('content-type')||'',type,url+' has wrong content type');
  }
  const sw=await (await fetch(baseUrl+'/sw.js')).text();
  assert.match(sw,/pathname\.startsWith\('\/api\/'\)/);
});

test('dashboard JavaScript parses and interactive 3D globe is present',()=>{
  const html=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
  const scripts=html.split('<script>').slice(1).map(part=>part.split('</script>')[0]);
  assert.ok(scripts.length>=1,'inline application script should exist');
  for(const script of scripts)new vm.Script(script);
  for(const marker of ['globeCanvas','pointerdown','pointermove','globePlus','globeMinus','/api/status','/api/nodes','LIVE PROBE REGISTRY','probeColor','bezierPoint','setTimeout(tick,2000)','nearbyPanel','nearbyRegistry','nearbyStart','syncNearbyNodes','Android 客户端'])assert.ok(html.includes(marker),'missing '+marker);
  assert.match(html,/GLOBAL NETWORK \/ LIVE ROUTES/);
  assert.match(html,/未生成模拟数据/);
});

test('live node probes return real endpoint results without caching',async()=>{
  const r=await fetch(baseUrl+'/api/nodes');
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-type')||'',/application\/json/);
  assert.equal(r.headers.get('cache-control'),'no-store');
  const data=await r.json();
  assert.ok(Array.isArray(data.nodes));
  assert.ok(data.nodes.length>=12,'expected at least twelve public HTTPS probes');
  assert.equal(data.kind,'public_endpoint_probes_not_nearby_devices');
  assert.match(data.source,/public HTTPS probes/);
  for(const n of data.nodes){
    assert.equal(n.kind,'public_endpoint_probe');
    assert.equal(typeof n.lat,'number');
    assert.equal(typeof n.lon,'number');
    for(const key of ['id','name','provider','category','lat','lon','endpoint','ok','status','latencyMs','checkedAt'])assert.ok(key in n,'missing '+key);
    assert.ok(n.ok===true||n.ok===false,'probe must report a real boolean result');
  }
});

test('security monitoring endpoint exposes bounded, non-cached event telemetry',async()=>{
  const r=await fetch(baseUrl+'/api/security');
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-type')||'',/application\/json/);
  assert.equal(r.headers.get('cache-control'),'no-store');
  const data=await r.json();
  assert.equal(data.scope,'application-http-and-websocket-observations');
  assert.ok(['memory','postgres','memory-fallback'].includes(data.storage));
  assert.ok(data.retention);
  assert.equal(data.filters.limit,100);
  assert.ok(Array.isArray(data.events));
  assert.ok(data.events.length<=100);
  for(const key of ['events','high','medium','low'])assert.ok(key in data.totals);
});

test('CISA threat-intelligence endpoint returns bounded, labeled data and no-store headers',async()=>{
  const r=await fetch(baseUrl+'/api/threat-intel');
  assert.ok([200,503].includes(r.status));
  assert.match(r.headers.get('content-type')||'',/application\/json/);
  assert.equal(r.headers.get('cache-control'),'no-store');
  const data=await r.json();
  assert.ok(['ok','stale','unavailable'].includes(data.status));
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.length<=30);
  if(data.items.length){
    assert.match(data.items[0].cveID,/^CVE-\d{4}-\d{4,}$/);
    assert.ok(data.items[0].sourceUrl.includes('cisa.gov'));
  }
});

test('security history API supports severity, event-kind and limit filters',async()=>{
  const r=await fetch(baseUrl+'/api/security?severity=high&kind=suspicious_path&limit=5');
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.filters.severity,'high');
  assert.equal(data.filters.kind,'suspicious_path');
  assert.equal(data.filters.limit,5);
  assert.ok(data.events.length<=5);
  for(const e of data.events){assert.equal(e.severity,'high');assert.equal(e.kind,'suspicious_path')}
});


test('Android release version follows the four-part version policy and adaptive icon is configured',()=>{
  const gradle=fs.readFileSync(path.join(__dirname,'..','android-client','app','build.gradle'),'utf8');
  const manifest=fs.readFileSync(path.join(__dirname,'..','android-client','app','src','main','AndroidManifest.xml'),'utf8');
  const updater=fs.readFileSync(path.join(__dirname,'public','mobile-client.js'),'utf8');
  assert.match(gradle,/versionCode\s+5000000/);
  assert.match(gradle,/versionName\s+'v0\.5\.0\.0'/);
  assert.match(manifest,/android:icon="@mipmap\/ic_launcher"/);
  assert.ok(fs.existsSync(path.join(__dirname,'..','android-client','app','src','main','res','mipmap','ic_launcher.xml')),'legacy launcher icon fallback should exist');
  assert.match(manifest,/android\.support\.FILE_PROVIDER_PATHS/);
  assert.ok(updater.includes('targetVersionFormat'), 'client validates four-part version names');
  assert.match(updater,/SHA-256/);
  assert.match(updater,/downloadAndInstall/);
});
