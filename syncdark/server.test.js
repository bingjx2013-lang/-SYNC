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
  const r=await fetch(baseUrl+'/api/status');
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
  const scripts=[...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)];
  assert.ok(scripts.length>=1,'inline application script should exist');
  for(const script of scripts)new vm.Script(script);
  for(const marker of ['globeCanvas','pointerdown','pointermove','globePlus','globeMinus','/api/status','setTimeout(tick,2000)'])assert.ok(html.includes(marker),'missing '+marker);
  assert.match(html,/3D INTERACTIVE/);
  assert.match(html,/未生成模拟数据/);
});
