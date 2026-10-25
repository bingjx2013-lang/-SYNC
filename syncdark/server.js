const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{WebSocketServer}=require('ws');
const instanceId=crypto.randomUUID();
let redisPub=null,redisSub=null,redisReady=false;
const CHAT_CHANNEL='syncdark:world-chat:v1';
function chatHistoryKey(room){return 'syncdark:chat:history:'+room;}
if(process.env.REDIS_URL){try{const Redis=require('ioredis');redisPub=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:5000,retryStrategy:n=>Math.min(n*1000,10000),tls:{}});redisSub=new Redis(process.env.REDIS_URL,{lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:5000,retryStrategy:n=>Math.min(n*1000,10000),tls:{}});redisPub.on('error',e=>{redisReady=false;console.error('chat Redis publisher error',String(e.message||e).slice(0,120))});redisSub.on('error',e=>{redisReady=false;console.error('chat Redis subscriber error',String(e.message||e).slice(0,120))});Promise.all([redisPub.connect(),redisSub.connect()]).then(()=>redisSub.subscribe(CHAT_CHANNEL)).then(()=>{redisReady=true;console.log('world chat Redis connected')}).catch(e=>{redisReady=false;console.error('chat Redis unavailable; local chat fallback active',String(e.message||e).slice(0,120))});redisSub.on('message',(channel,raw)=>{if(channel!==CHAT_CHANNEL)return;try{const event=JSON.parse(raw);if(event.origin===instanceId||!event.room)return;const r=rooms.get(event.room);if(!r)return;if(event.type==='msg'){r.hist.push(event.payload);if(r.hist.length>50)r.hist.shift();bcast(r,event.payload)}else if(event.type==='users'){bcast(r,{t:'users',list:users(r)})}}catch{}})}catch(e){console.error('chat Redis initialization failed; local chat fallback active',String(e.message||e).slice(0,120))}}
let pgPool=null,pgReady=false,pgInitError=null;
if(process.env.DATABASE_URL){try{const {Pool}=require('pg');pgPool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:false},max:5,connectionTimeoutMillis:5000});pgPool.on('error',e=>{pgInitError=String(e.message||e).slice(0,160)});pgPool.query('CREATE TABLE IF NOT EXISTS sync_security_events (id BIGSERIAL PRIMARY KEY,event_ts BIGINT NOT NULL,kind TEXT NOT NULL,severity TEXT NOT NULL,summary TEXT NOT NULL,source TEXT NOT NULL)').then(()=>pgPool.query('CREATE INDEX IF NOT EXISTS sync_security_events_ts_idx ON sync_security_events(event_ts DESC)')).then(()=>{pgReady=true;console.log('security event database ready')}).catch(e=>{pgInitError=String(e.message||e).slice(0,160);console.error('security database init failed',pgInitError)})}catch(e){pgInitError=String(e.message||e).slice(0,160)}}

const PORT=process.env.PORT||3000,PUB=path.join(__dirname,'public');
const NODE_TARGETS=[
 {id:'CF-DOH',name:'Cloudflare DNS',provider:'Cloudflare',category:'dns',lat:37.8,lon:-122.4,displayUrl:'cloudflare-dns.com/dns-query',url:'https://cloudflare-dns.com/dns-query?name=example.com&type=A',headers:{accept:'application/dns-json'}},
 {id:'GOOGLE-204',name:'Google connectivity',provider:'Google',category:'web',lat:37.4,lon:-122.1,displayUrl:'google.com/generate_204',url:'https://www.google.com/generate_204'},
 {id:'GITHUB-API',name:'GitHub API',provider:'GitHub',category:'web',lat:37.8,lon:-122.4,displayUrl:'api.github.com/zen',url:'https://api.github.com/zen',headers:{'user-agent':'SYNC-network-monitor/1.0','accept':'text/plain'}},
 {id:'MS-CONNECT',name:'Microsoft connectivity',provider:'Microsoft',category:'web',lat:47.6,lon:-122.3,displayUrl:'msftconnecttest.com/connecttest.txt',url:'https://www.msftconnecttest.com/connecttest.txt'},
 {id:'QUAD9-DNS',name:'Quad9 DNS',provider:'Quad9',category:'dns',lat:47.4,lon:8.5,displayUrl:'on.quad9.net',url:'https://on.quad9.net/'},
 {id:'OPENDNS-IP',name:'OpenDNS diagnostic',provider:'Cisco OpenDNS',category:'dns',lat:37.4,lon:-121.9,displayUrl:'diagnostic.opendns.com/myip',url:'https://diagnostic.opendns.com/myip'},
 {id:'CF-TRACE',name:'Cloudflare network trace',provider:'Cloudflare',category:'web',lat:51.5,lon:-0.1,displayUrl:'cloudflare.com/cdn-cgi/trace',url:'https://www.cloudflare.com/cdn-cgi/trace'},
 {id:'GOOGLE-DOH',name:'Google Public DNS',provider:'Google',category:'dns',lat:35.7,lon:139.7,displayUrl:'dns.google/resolve',url:'https://dns.google/resolve?name=example.com&type=A',headers:{accept:'application/dns-json'}},
 {id:'WIKIPEDIA',name:'Wikimedia web',provider:'Wikimedia',category:'web',lat:52.5,lon:13.4,displayUrl:'www.wikipedia.org',url:'https://www.wikipedia.org/'},
 {id:'MOZILLA',name:'Mozilla web',provider:'Mozilla',category:'web',lat:37.8,lon:-122.4,displayUrl:'www.mozilla.org',url:'https://www.mozilla.org/'},
 {id:'FASTLY',name:'Fastly web',provider:'Fastly',category:'web',lat:37.8,lon:-122.4,displayUrl:'www.fastly.com',url:'https://www.fastly.com/'},
 {id:'AWS-STATUS',name:'AWS status page',provider:'Amazon Web Services',category:'web',lat:39.0,lon:-77.5,displayUrl:'health.aws.amazon.com/health/status',url:'https://health.aws.amazon.com/health/status'}
];
let nodeSnapshot=null,nodeSnapshotAt=0,nodeProbeInFlight=null;
const securityEvents=[];const requestWindows=new Map();let securitySeq=0;
const KEV_URL='https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
let kevCache={fetchedAt:0,sourceUpdatedAt:null,items:[],catalogVersion:null,error:null},kevInFlight=null;
async function getKevCatalog(force=false){
  if(!force&&kevCache.fetchedAt&&Date.now()-kevCache.fetchedAt<6*60*60*1000)return kevCache;
  if(kevInFlight)return kevInFlight;
  kevInFlight=(async()=>{
    const response=await fetch(KEV_URL,{headers:{'Accept':'application/json','User-Agent':'SYNC-Security-Monitor/1.0'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('CISA catalog HTTP '+response.status);
    const data=await response.json();
    if(!Array.isArray(data.vulnerabilities))throw new Error('Unexpected CISA catalog format');
    const now=Date.now(),cutoff=now-60*86400000;
    const items=data.vulnerabilities.filter(v=>/^CVE-\d{4}-\d{4,}$/.test(v.cveID||''))
      .map(v=>({cveID:v.cveID,dateAdded:v.dateAdded||'',vendorProject:v.vendorProject||'Unknown',product:v.product||'',vulnerabilityName:v.vulnerabilityName||'',shortDescription:String(v.shortDescription||'').slice(0,600),requiredAction:String(v.requiredAction||'Follow vendor guidance and apply available patches.').slice(0,500),knownRansomwareCampaignUse:v.knownRansomwareCampaignUse||'Unknown',dueDate:v.dueDate||'',sourceUrl:'https://www.cisa.gov/known-exploited-vulnerabilities-catalog'}))
      .filter(v=>{const t=Date.parse(v.dateAdded);return Number.isFinite(t)&&t>=cutoff})
      .sort((a,b)=>Date.parse(b.dateAdded)-Date.parse(a.dateAdded)).slice(0,30);
    kevCache={fetchedAt:now,sourceUpdatedAt:data.dateReleased||data.catalogVersion||null,catalogVersion:data.catalogVersion||null,totalCatalogEntries:data.count||data.vulnerabilities.length,items,error:null};
    return kevCache;
  })().catch(error=>{kevCache={...kevCache,error:String(error.message||error).slice(0,180)};return kevCache}).finally(()=>{kevInFlight=null});
  return kevInFlight;
}

function securityEvent(kind,severity,summary,source='server'){
  const event={id:++securitySeq,ts:Date.now(),kind,severity,summary,source};
  securityEvents.unshift(event);if(securityEvents.length>250)securityEvents.length=250;
  if(pgPool&&pgReady)pgPool.query('INSERT INTO sync_security_events(event_ts,kind,severity,summary,source) VALUES($1,$2,$3,$4,$5)',[event.ts,event.kind,event.severity,event.summary,event.source]).catch(e=>{pgInitError=String(e.message||e).slice(0,160)});
}
function sourceKey(req){
  const raw=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0,8);
}
function observeRequest(req){
  const now=Date.now(),key=sourceKey(req),url=String(req.url||'/').slice(0,500);
  let w=requestWindows.get(key);if(!w||now-w.start>60000)w={start:now,count:0};w.count++;requestWindows.set(key,w);
  if(w.count===60)securityEvent('request_burst','medium','单一来源 60 秒内请求达到 60 次，需人工核查',key);
  if(/(?:\.\.\/|%2e%2e|\/\.env|\/wp-admin|\/wp-login|\/etc\/passwd|\/\.git\/)/i.test(url))
    securityEvent('suspicious_path','high','检测到疑似目录穿越或常见敏感路径扫描请求',key);
  if(!['GET','HEAD','POST','OPTIONS'].includes(req.method))
    securityEvent('unusual_method','medium','检测到非预期 HTTP 方法：'+String(req.method).slice(0,16),key);
  if(requestWindows.size>2000)for(const [k,v] of requestWindows)if(now-v.start>120000)requestWindows.delete(k);
}

let lastCpu=process.cpuUsage(),lastCpuAt=Date.now();
const MT={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const ANDROID_RELEASES_API='https://api.github.com/repos/bingjx2013-lang/-SYNC/releases?per_page=20';
let androidReleaseCache={checkedAt:0,release:null,error:null},androidReleaseInFlight=null;
async function getAndroidRelease(force=false){
  const now=Date.now();
  if(!force&&androidReleaseCache.checkedAt&&now-androidReleaseCache.checkedAt<60000){
    if(androidReleaseCache.release)return androidReleaseCache.release;
    const cachedError=new Error(androidReleaseCache.error||'Android release unavailable');
    cachedError.code=androidReleaseCache.error==='NO_ANDROID_RELEASE'?'NO_ANDROID_RELEASE':'RELEASE_LOOKUP_FAILED';
    throw cachedError;
  }
  if(androidReleaseInFlight)return androidReleaseInFlight;
  androidReleaseInFlight=(async()=>{
    // Prefer the signed APK and checksum manifest published into this Render test site's
    // own static directory by android-client-apk.yml. That is the deployment's source of truth.
    const staticApkPath=path.join(PUB,'downloads','syncdark-android-test.apk');
    const staticMetadataPath=path.join(PUB,'downloads','android-version.json');
    try{
      const metadata=JSON.parse(await fs.promises.readFile(staticMetadataPath,'utf8'));
      const stat=await fs.promises.stat(staticApkPath);
      if(stat.isFile()&&stat.size>0&&stat.size<=100*1024*1024){
        const actualSha=crypto.createHash('sha256').update(await fs.promises.readFile(staticApkPath)).digest('hex');
        const valid=metadata&&metadata.status==='available'&&
          /^v\d+\.\d+\.\d+\.\d+$/.test(String(metadata.versionName||''))&&
          Number.isSafeInteger(Number(metadata.versionCode))&&Number(metadata.versionCode)>0&&
          Number.isSafeInteger(Number(metadata.sizeBytes))&&Number(metadata.sizeBytes)===stat.size&&
          /^[a-f0-9]{64}$/i.test(String(metadata.sha256||''))&&actualSha===String(metadata.sha256).toLowerCase()&&
          Number.isFinite(Date.parse(metadata.publishedAt||''));
        if(valid){
          const result={metadata:{versionName:metadata.versionName,versionCode:Number(metadata.versionCode),sha256:String(metadata.sha256).toLowerCase(),sizeBytes:stat.size,publishedAt:metadata.publishedAt},apkPath:staticApkPath,tagName:metadata.versionName,source:'render-static',releaseUrl:null};
          androidReleaseCache={checkedAt:Date.now(),release:result,error:null};return result;
        }
      }
    }catch(_){ /* Fall back to public GitHub releases if the local signed package is absent. */ }
    const response=await fetch(ANDROID_RELEASES_API,{headers:{'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'SYNC-Android-Updater/1.0'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error('GitHub release API HTTP '+response.status);
    const releases=await response.json();
    if(!Array.isArray(releases))throw new Error('Invalid GitHub releases response');
    const candidates=releases.filter(r=>r&&!r.draft&&/^v\d+\.\d+\.\d+\.\d+$/.test(String(r.tag_name||''))&&Array.isArray(r.assets))
      .sort((a,b)=>Date.parse(b.published_at||b.created_at||0)-Date.parse(a.published_at||a.created_at||0));
    for(const release of candidates){
      const apkAsset=release.assets.find(a=>a.name==='syncdark-android.apk'&&Number(a.size)>0&&typeof a.browser_download_url==='string');
      const metaAsset=release.assets.find(a=>a.name==='android-version.json'&&typeof a.browser_download_url==='string');
      if(!apkAsset||!metaAsset)continue;
      const metaResponse=await fetch(metaAsset.browser_download_url,{headers:{'Accept':'application/json','User-Agent':'SYNC-Android-Updater/1.0'},signal:AbortSignal.timeout(8000),redirect:'follow'});
      if(!metaResponse.ok)continue;
      let metadata;try{metadata=await metaResponse.json()}catch{continue}
      const valid=metadata&&metadata.versionName===release.tag_name&&
        /^v\d+\.\d+\.\d+\.\d+$/.test(String(metadata.versionName||''))&&
        Number.isSafeInteger(Number(metadata.versionCode))&&Number(metadata.versionCode)>0&&
        Number.isSafeInteger(Number(metadata.sizeBytes))&&Number(metadata.sizeBytes)===Number(apkAsset.size)&&Number(metadata.sizeBytes)<=100*1024*1024&&
        /^[a-f0-9]{64}$/.test(String(metadata.sha256||''))&&Number.isFinite(Date.parse(metadata.publishedAt||release.published_at||''));
      if(!valid)continue;
      const result={metadata:{versionName:metadata.versionName,versionCode:Number(metadata.versionCode),sha256:metadata.sha256,sizeBytes:Number(metadata.sizeBytes),publishedAt:metadata.publishedAt||release.published_at},apkUrl:apkAsset.browser_download_url,tagName:release.tag_name,releaseUrl:release.html_url};
      androidReleaseCache={checkedAt:Date.now(),release:result,error:null};return result;
    }
    const missing=new Error('No valid Android APK release exists');missing.code='NO_ANDROID_RELEASE';throw missing;
  })().catch(error=>{
    const code=error.code==='NO_ANDROID_RELEASE'?'NO_ANDROID_RELEASE':'RELEASE_LOOKUP_FAILED';
    androidReleaseCache={checkedAt:Date.now(),release:null,error:code};
    const wrapped=new Error(error.message||'Android release lookup failed');wrapped.code=code;throw wrapped;
  }).finally(()=>{androidReleaseInFlight=null});
  return androidReleaseInFlight;
}

const srv=http.createServer((req,res)=>{
  observeRequest(req);
  if(req.url.split('?')[0]==='/api/threat-intel'){
    const force=new URL(req.url,'http://localhost').searchParams.get('refresh')==='1';
    getKevCatalog(force).then(data=>{
      const ready=!!data.fetchedAt;
      res.writeHead(ready?200:503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(JSON.stringify({source:'CISA Known Exploited Vulnerabilities (KEV) Catalog',sourceUrl:'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',feedUrl:KEV_URL,scope:'known-exploited-vulnerability advisories; not live attack telemetry',status:ready?(data.error?'stale':'ok'):'unavailable',checkedAt:Date.now(),fetchedAt:data.fetchedAt||null,sourceUpdatedAt:data.sourceUpdatedAt||null,catalogVersion:data.catalogVersion||null,totalCatalogEntries:data.totalCatalogEntries||null,items:data.items||[],error:data.error||null}));
    }).catch(()=>{if(!res.writableEnded){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify({status:'unavailable',items:[],error:'Threat feed unavailable'}))}});
    return
  }
  if(req.url.split('?')[0]==='/api/security'){
    const u=new URL(req.url,'http://localhost');
    const limit=Math.max(1,Math.min(250,Number.parseInt(u.searchParams.get('limit')||'100',10)||100));
    const severity=['high','medium','low'].includes(u.searchParams.get('severity'))?u.searchParams.get('severity'):'';
    const kind=/^[a-z_]{1,40}$/.test(u.searchParams.get('kind')||'')?u.searchParams.get('kind'):'';
    const since=Math.max(0,Number(u.searchParams.get('since')||0)||0);
    const matches=e=>(!severity||e.severity===severity)&&(!kind||e.kind===kind)&&(!since||e.ts>=since);
    const send=(events,storage,totalCounts)=>{res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify({checkedAt:Date.now(),scope:'application-http-and-websocket-observations',storage,retention:storage==='postgres'?'persistent database history':'current process memory only; set DATABASE_URL to enable persistent history',filters:{severity:severity||null,kind:kind||null,since:since||null,limit},totals:totalCounts||{events:events.length,high:events.filter(e=>e.severity==='high').length,medium:events.filter(e=>e.severity==='medium').length,low:events.filter(e=>e.severity==='low').length},events}))};
    if(pgPool&&pgReady){
      const where=[],values=[];
      if(severity){values.push(severity);where.push('severity=$'+values.length)}
      if(kind){values.push(kind);where.push('kind=$'+values.length)}
      if(since){values.push(since);where.push('event_ts>=$'+values.length)}
      const clause=where.length?' WHERE '+where.join(' AND '):'';
      Promise.all([
        pgPool.query('SELECT id,event_ts,kind,severity,summary,source FROM sync_security_events'+clause+' ORDER BY event_ts DESC LIMIT '+limit,values),
        pgPool.query("SELECT COUNT(*)::int AS events,COUNT(*) FILTER(WHERE severity='high')::int AS high,COUNT(*) FILTER(WHERE severity='medium')::int AS medium,COUNT(*) FILTER(WHERE severity='low')::int AS low FROM sync_security_events"+clause,values)
      ]).then(([rows,count])=>{
        const events=rows.rows.map(e=>({id:e.id,ts:Number(e.event_ts),kind:e.kind,severity:e.severity,summary:e.summary,source:e.source}));
        send(events,'postgres',count.rows[0]||undefined);
      }).catch(()=>send(securityEvents.filter(matches).slice(0,limit),'memory-fallback'));
      return
    }
    send(securityEvents.filter(matches).slice(0,limit),'memory');return
  }
  if(req.url==='/healthz'){res.writeHead(200).end('ok');return}
  if(req.url.split('?')[0]==='/api/nodes'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const now=Date.now();
    if(!req.url.includes('refresh=') && nodeSnapshot && now-nodeSnapshotAt<5000){res.end(JSON.stringify({checkedAt:nodeSnapshotAt,source:'public HTTPS probes from this deployment region (server-side checks)',kind:'public_endpoint_probes_not_nearby_devices',nodes:nodeSnapshot}));return}
    if(nodeProbeInFlight){nodeProbeInFlight.then(data=>{if(!res.writableEnded)res.end(JSON.stringify({checkedAt:nodeSnapshotAt,source:'public HTTPS probes from this deployment region (server-side checks)',kind:'public_endpoint_probes_not_nearby_devices',nodes:data}))}).catch(()=>{if(!res.writableEnded)res.end(JSON.stringify({checkedAt:Date.now(),source:'public HTTPS probes from this deployment region (server-side checks)',kind:'public_endpoint_probes_not_nearby_devices',nodes:[]}))});return}
    nodeProbeInFlight=Promise.all(NODE_TARGETS.map(async target=>{
      const start=Date.now();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3000);
      try{
        const response=await fetch(target.url,{method:'GET',headers:target.headers||{},signal:controller.signal,redirect:'follow'});
        const elapsed=Date.now()-start;
        await response.body?.cancel().catch(()=>{});
        return {id:target.id,name:target.name,provider:target.provider,category:target.category,kind:'public_endpoint_probe',lat:target.lat,lon:target.lon,endpoint:target.displayUrl,ok:response.status>=200&&response.status<400,status:response.status,statusCode:response.status,latencyMs:elapsed,checkedAt:Date.now(),detail:response.status>=200&&response.status<500?'HTTPS endpoint responded':'HTTP error'};
      }catch(error){
        return {id:target.id,name:target.name,provider:target.provider,category:target.category,kind:'public_endpoint_probe',lat:target.lat,lon:target.lon,endpoint:target.displayUrl,ok:false,status:0,statusCode:0,latencyMs:null,checkedAt:Date.now(),detail:error.name==='AbortError'?'timeout':'connection failed'};
      }finally{clearTimeout(timer)}
    })).then(nodes=>{nodeSnapshot=nodes;nodeSnapshotAt=Date.now();return nodes}).finally(()=>{nodeProbeInFlight=null});
    nodeProbeInFlight.then(nodes=>{if(!res.writableEnded)res.end(JSON.stringify({checkedAt:nodeSnapshotAt,source:'public HTTPS probes from this deployment region (server-side checks)',kind:'public_endpoint_probes_not_nearby_devices',nodes}))}).catch(()=>{if(!res.writableEnded)res.end(JSON.stringify({checkedAt:Date.now(),source:'public HTTPS probes from this deployment region (server-side checks)',kind:'public_endpoint_probes_not_nearby_devices',nodes:[]}))});
    return
  }
  if(req.url.split('?')[0]==='/api/status'){
    const now=Date.now(),elapsed=Math.max(1,now-lastCpuAt),delta=process.cpuUsage(lastCpu);
    const cpuPercent=Math.min(100,Math.max(0,((delta.user+delta.system)/1000/elapsed)*100));
    lastCpu=process.cpuUsage();lastCpuAt=now;
    const mem=process.memoryUsage();
    const connectedClients=[...wss.clients].filter(c=>c.readyState===1).length;
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify({uptimeSeconds:Math.floor(process.uptime()),cpuPercent:Number(cpuPercent.toFixed(1)),rssMb:Number((mem.rss/1048576).toFixed(1)),heapUsedMb:Number((mem.heapUsed/1048576).toFixed(1)),heapTotalMb:Number((mem.heapTotal/1048576).toFixed(1)),connectedClients,rooms:rooms.size,appVersion:'v0.6.0.2',latestAppVersion:'v0.6.0.2',serverVersion:'1.0.4',timestamp:now}));return
  }
  if(req.url.split('?')[0]==='/api/android/version'){
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(req.method!=='GET'&&req.method!=='HEAD'){
      res.writeHead(405,{...headers,'Allow':'GET, HEAD'}).end(JSON.stringify({status:'unavailable',error:'Method not allowed'}));
      return
    }
    getAndroidRelease().then(release=>{
      res.writeHead(200,headers);
      res.end(req.method==='HEAD'?'':JSON.stringify({...release.metadata,status:'available',downloadUrl:'/api/download/android.apk',releaseTag:release.tagName,releaseUrl:release.releaseUrl,distribution:release.source||'github-release'}));
    }).catch(error=>{
      res.writeHead(503,headers);
      res.end(JSON.stringify({status:'unavailable',code:error.code==='NO_ANDROID_RELEASE'?'release_not_published':'release_service_unavailable',error:error.code==='NO_ANDROID_RELEASE'?'尚未发布可用的签名 Android APK。':'Android 版本服务暂时不可用，请稍后重试。'}));
    });
    return
  }
  if(req.url.split('?')[0]==='/api/download/android.apk'){
    const jsonHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(req.method!=='GET'&&req.method!=='HEAD'){
      res.writeHead(405,{...jsonHeaders,'Allow':'GET, HEAD'}).end(JSON.stringify({error:'Method not allowed'}));
      return
    }
    getAndroidRelease().then(async release=>{
      if(req.method==='HEAD'){
        res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="syncdark-android.apk"','Content-Length':release.metadata.sizeBytes,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end();return
      }
      let bytes;
      if(release.apkPath){
        bytes=await fs.promises.readFile(release.apkPath);
      }else{
        const remote=await fetch(release.apkUrl,{headers:{'Accept':'application/vnd.android.package-archive','User-Agent':'SYNC-Android-Updater/1.0'},signal:AbortSignal.timeout(30000),redirect:'follow'});
        if(!remote.ok||!remote.body)throw new Error('release asset fetch failed');
        bytes=Buffer.from(await remote.arrayBuffer());
      }
      if(bytes.length!==release.metadata.sizeBytes||crypto.createHash('sha256').update(bytes).digest('hex')!==release.metadata.sha256){
        res.writeHead(502,jsonHeaders).end(JSON.stringify({error:'APK 完整性核验失败，已阻止下载。'}));return
      }
      res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="syncdark-android.apk"','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(bytes);
    }).catch(error=>{
      if(res.writableEnded)return;
      const status=error.code==='NO_ANDROID_RELEASE'?503:502;
      res.writeHead(status,jsonHeaders).end(JSON.stringify({error:status===503?'尚未发布可用的签名 Android APK。':'Android 安装包暂时无法下载，请稍后重试。'}));
    });
    return
  }
  let p;try{p=decodeURIComponent(req.url.split('?')[0])}catch{res.writeHead(400).end();return}
  if(p.endsWith('/'))p+='index.html';
  const f=path.join(PUB,p);
  if(!f.startsWith(PUB+path.sep)){res.writeHead(403).end();return}
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404).end('not found');return}
    res.writeHead(200,{'Content-Type':MT[path.extname(f)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':p==='/sw.js'||p==='/index.html'?'no-cache':'public, max-age=3600'});
    res.end(d);
  });
});
const wss=new WebSocketServer({server:srv,maxPayload:16*1024,perMessageDeflate:false});
const rooms=new Map();
const send=(ws,o)=>{if(ws.readyState===1)ws.send(JSON.stringify(o))};
const users=r=>[...r.clients].map(c=>c.name);
const bcast=(r,o)=>{const s=JSON.stringify(o);r.clients.forEach(c=>{if(c.readyState===1)c.send(s)})};
async function persistChatMessage(room,message){
  if(!redisReady||!redisPub)return;
  try{const key=chatHistoryKey(room);await redisPub.rpush(key,JSON.stringify(message));await redisPub.ltrim(key,-50,-1);await redisPub.expire(key,60*60*24*7)}catch(e){redisReady=false;console.error('chat history write failed',String(e.message||e).slice(0,120))}
}
async function loadChatHistory(room){
  if(!redisReady||!redisPub)return null;
  try{const rows=await redisPub.lrange(chatHistoryKey(room),-50,-1);return rows.map(row=>JSON.parse(row)).filter(m=>m&&m.t==='msg')}catch(e){redisReady=false;console.error('chat history read failed',String(e.message||e).slice(0,120));return null}
}
async function publishChatEvent(room,type,payload){
  if(!redisReady||!redisPub)return;
  try{await redisPub.publish(CHAT_CHANNEL,JSON.stringify({origin:instanceId,room,type,payload}))}catch(e){redisReady=false;console.error('chat publish failed',String(e.message||e).slice(0,120))}
}
function leave(ws){
  const r=ws.room;if(!r)return;
  r.clients.delete(ws);ws.room=null;
  if(r.clients.size){const payload={t:'users',list:users(r)};bcast(r,payload);publishChatEvent(r.id,'users',payload)}
  else setTimeout(()=>{if(!r.clients.size&&rooms.get(r.id)===r)rooms.delete(r.id)},600000);
}
wss.on('connection',ws=>{
  ws.alive=true;ws.hits=[];
  ws.on('pong',()=>{ws.alive=true});
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.t==='join'){
      const room=String(m.room||'').slice(0,30),name=String(m.name||'').trim().slice(0,20);
      if(!/^[\w\-\u4e00-\u9fa5]+$/.test(room)||!name){securityEvent('invalid_chat_join','low','聊天加入请求的房间名或昵称格式无效','websocket');return send(ws,{t:'err',x:'房间名或昵称不合法'});}
      leave(ws);
      let r=rooms.get(room);
      if(!r){if(rooms.size>=200)return send(ws,{t:'err',x:'服务器房间数已满'});r={id:room,clients:new Set(),hist:[]};rooms.set(room,r)}
      if(r.clients.size>=200){securityEvent('room_capacity','low','聊天房间达到连接容量限制','websocket');return send(ws,{t:'err',x:'房间已满'});}
      ws.room=r;ws.name=name;ws.cid=String(m.cid||'').slice(0,24);r.clients.add(ws);
      loadChatHistory(room).then(history=>{if(ws.room!==r)return;if(history){r.hist=history}send(ws,{t:'hist',m:r.hist});const payload={t:'users',list:users(r)};bcast(r,payload);publishChatEvent(room,'users',payload)});
    }else if(m.t==='msg'&&ws.room){
      const now=Date.now();ws.hits=ws.hits.filter(t=>now-t<5000);
      if(ws.hits.length>=10){securityEvent('chat_rate_limit','medium','聊天连接触发每 5 秒消息速率限制','websocket');return send(ws,{t:'err',x:'发送太快，请稍后再试'});}
      ws.hits.push(now);
      const x=String(m.x||'').slice(0,4000);if(!x)return;
      const o={t:'msg',n:ws.name,c:ws.cid,x,e:m.e?1:0,ts:now},r=ws.room;
      r.hist.push(o);if(r.hist.length>50)r.hist.shift();
      bcast(r,o);persistChatMessage(r.id,o);publishChatEvent(r.id,'msg',o);
    }
  });
  ws.on('close',()=>leave(ws));ws.on('error',()=>{});
});
setInterval(()=>wss.clients.forEach(ws=>{if(!ws.alive)return ws.terminate();ws.alive=false;ws.ping()}),30000);
srv.listen(PORT,()=>console.log('listening on',PORT));
