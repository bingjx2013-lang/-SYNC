const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000,PUB=path.join(__dirname,'public');
const MT={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const srv=http.createServer((req,res)=>{
  if(req.url==='/healthz'){res.writeHead(200).end('ok');return}
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
