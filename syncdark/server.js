const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000,PUB=path.join(__dirname,'public');
const NODE_TARGETS=[
 {id:'CF-DOH',name:'Cloudflare DNS',provider:'Cloudflare',category:'dns',lat:37.8,lon:-122.4,displayUrl:'cloudflare-dns.com/dns-query',url:'https://cloudflare-dns.com/dns-query?name=example.com&type=A',headers:{accept:'application/dns-json'}},
 {id:'GOOGLE-204',name:'Google connectivity',provider:'Google',category:'web',lat:37.4,lon:-122.1,displayUrl:'google.com/generate_204',url:'https://www.google.com/generate_204'},
 {id:'GITHUB-API',name:'GitHub API',provider:'GitHub',category:'web',lat:37.8,lon:-122.4,displayUrl:'api.github.com/zen',url:'https://api.github.com/zen',headers:{'user-agent':'SYNC-network-monitor/1.0','accept':'text/plain'}},
 {id:'MS-CONNECT',name:'Microsoft connectivity',provider:'Microsoft',category:'web',lat:47.6,lon:-122.3,displayUrl:'msftconnecttest.com/connecttest.txt',url:'https://www.msftconnecttest.com/connecttest.txt'},
 {id:'QUAD9-DNS',name:'Quad9 DNS',provider:'Quad9',category:'dns',lat:47.4,lon:8.5,displayUrl:'on.quad9.net',url:'https://on.quad9.net/'},
 {id:'OPENDNS-IP',name:'OpenDNS diagnostic',provider:'Cisco OpenDNS',category:'dns',lat:37.4,lon:-121.9,displayUrl:'diagnostic.opendns.com/myip',url:'https://diagnostic.opendns.com/myip'},
 {id:'CLOUDFLARE-TRACE',name:'Cloudflare network trace',provider:'Cloudflare',category:'web',lat:51.5,lon:-0.1,displayUrl:'cloudflare.com/cdn-cgi/trace',url:'https://www.cloudflare.com/cdn-cgi/trace'},
 {id:'GOOGLE-DOH',name:'Google Public DNS',provider:'Google',category:'dns',lat:35.7,lon:139.7,displayUrl:'dns.google/resolve',url:'https://dns.google/resolve?name=example.com&type=A',headers:{accept:'application/dns-json'}}
];
let nodeSnapshot=null,nodeSnapshotAt=0,nodeProbeInFlight=null;

let lastCpu=process.cpuUsage(),lastCpuAt=Date.now();
const MT={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const srv=http.createServer((req,res)=>{
  if(req.url==='/healthz'){res.writeHead(200).end('ok');return}
  if(req.url==='/api/nodes'){
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const now=Date.now();
    if(nodeSnapshot && now-nodeSnapshotAt<5000){res.end(JSON.stringify({checkedAt:nodeSnapshotAt,source:'server-side HTTPS probes from this deployment region',nodes:nodeSnapshot}));return}
    if(nodeProbeInFlight){nodeProbeInFlight.then(data=>{if(!res.writableEnded)res.end(JSON.stringify({checkedAt:nodeSnapshotAt,source:'server-side HTTPS probes from this deployment region',nodes:data}))}).catch(()=>{if(!res.writableEnded)res.end(JSON.stringify({checkedAt:Date.now(),source:'server-side HTTPS probes from this deployment region',nodes:[]}))});return}
    nodeProbeInFlight=Promise.all(NODE_TARGETS.map(async target=>{
      const start=Date.now();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3000);
      try{
        const response=await fetch(target.url,{method:'GET',headers:target.headers||{},signal:controller.signal,redirect:'follow'});
        const elapsed=Date.now()-start;
        await response.body?.cancel().catch(()=>{});
        return {id:target.id,name:target.name,provider:target.provider,category:target.category,lat:target.lat,lon:target.lon,endpoint:target.displayUrl,ok:response.status>=200&&response.status<500,status:response.status,latencyMs:elapsed,checkedAt:Date.now(),detail:response.status>=200&&response.status<500?'HTTPS endpoint responded':'HTTP error'};
      }catch(error){
        return {id:target.id,name:target.name,provider:target.provider,category:target.category,lat:target.lat,lon:target.lon,endpoint:target.displayUrl,ok:false,status:0,latencyMs:null,checkedAt:Date.now(),detail:error.name==='AbortError'?'timeout':'connection failed'};
      }finally{clearTimeout(timer)}
    })).then(nodes=>{nodeSnapshot=nodes;nodeSnapshotAt=Date.now();return nodes}).finally(()=>{nodeProbeInFlight=null});
    nodeProbeInFlight.then(nodes=>{if(!res.writableEnded)res.end(JSON.stringify({checkedAt:nodeSnapshotAt,source:'server-side HTTPS probes from this deployment region',nodes}))}).catch(()=>{if(!res.writableEnded)res.end(JSON.stringify({checkedAt:Date.now(),source:'server-side HTTPS probes from this deployment region',nodes:[]}))});
    return
  }
  if(req.url==='/api/status'){
    const now=Date.now(),elapsed=Math.max(1,now-lastCpuAt),delta=process.cpuUsage(lastCpu);
    const cpuPercent=Math.min(100,Math.max(0,((delta.user+delta.system)/1000/elapsed)*100));
    lastCpu=process.cpuUsage();lastCpuAt=now;
    const mem=process.memoryUsage();
    const connectedClients=[...wss.clients].filter(c=>c.readyState===1).length;
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify({uptimeSeconds:Math.floor(process.uptime()),cpuPercent:Number(cpuPercent.toFixed(1)),rssMb:Number((mem.rss/1048576).toFixed(1)),heapUsedMb:Number((mem.heapUsed/1048576).toFixed(1)),heapTotalMb:Number((mem.heapTotal/1048576).toFixed(1)),connectedClients,rooms:rooms.size,timestamp:now}));return
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
const wss=new WebSocketServer({server:srv,maxPayload:16*1024});
const rooms=new Map();
const send=(ws,o)=>{if(ws.readyState===1)ws.send(JSON.stringify(o))};
const users=r=>[...r.clients].map(c=>c.name);
const bcast=(r,o)=>{const s=JSON.stringify(o);r.clients.forEach(c=>{if(c.readyState===1)c.send(s)})};
function leave(ws){
  const r=ws.room;if(!r)return;
  r.clients.delete(ws);ws.room=null;
  if(r.clients.size)bcast(r,{t:'users',list:users(r)});
  else setTimeout(()=>{if(!r.clients.size&&rooms.get(r.id)===r)rooms.delete(r.id)},600000);
}
wss.on('connection',ws=>{
  ws.alive=true;ws.hits=[];
  ws.on('pong',()=>{ws.alive=true});
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.t==='join'){
      const room=String(m.room||'').slice(0,30),name=String(m.name||'').trim().slice(0,20);
      if(!/^[\w\-\u4e00-\u9fa5]+$/.test(room)||!name)return send(ws,{t:'err',x:'房间名或昵称不合法'});
      leave(ws);
      let r=rooms.get(room);
      if(!r){if(rooms.size>=200)return send(ws,{t:'err',x:'服务器房间数已满'});r={id:room,clients:new Set(),hist:[]};rooms.set(room,r)}
      if(r.clients.size>=200)return send(ws,{t:'err',x:'房间已满'});
      ws.room=r;ws.name=name;ws.cid=String(m.cid||'').slice(0,24);r.clients.add(ws);
      send(ws,{t:'hist',m:r.hist});bcast(r,{t:'users',list:users(r)});
    }else if(m.t==='msg'&&ws.room){
      const now=Date.now();ws.hits=ws.hits.filter(t=>now-t<5000);
      if(ws.hits.length>=10)return send(ws,{t:'err',x:'发送太快，请稍后再试'});
      ws.hits.push(now);
      const x=String(m.x||'').slice(0,4000);if(!x)return;
      const o={t:'msg',n:ws.name,c:ws.cid,x,e:m.e?1:0,ts:now},r=ws.room;
      r.hist.push(o);if(r.hist.length>50)r.hist.shift();
      bcast(r,o);
    }
  });
  ws.on('close',()=>leave(ws));ws.on('error',()=>{});
});
setInterval(()=>wss.clients.forEach(ws=>{if(!ws.alive)return ws.terminate();ws.alive=false;ws.ping()}),30000);
srv.listen(PORT,()=>console.log('listening on',PORT));
