const V='sync-v2',SHELL=['/','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname==='/healthz')return;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(res=>{
      if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put('/',cp))}
      return res;
    }).catch(()=>caches.match('/').then(m=>m||new Response('当前离线，页面暂不可用。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))));
    return;
  }
  e.respondWith(caches.match(r).then(cached=>{
    if(cached)return cached;
    return fetch(r).then(res=>{
      if(res.ok&&res.type==='basic'){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}
      return res;
    });
  }));
});
