const V='lexeikon-v96';
const PRE=['./','index.html','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png',
 'data/syr.json','data/cos.json','data/ka.json','data/kac.json','data/agwb.json','data/dil.json','data/gez.json','data/rai.json','data/la.json','data/hy.json','data/mis.json','data/cop.json','data/che.json','data/kun.json','data/latforms.json','data/grc.json','data/ml.json','data/laen.json','data/lafr.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(PRE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('lexeikon-v')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url),font=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if(u.origin!==location.origin&&!font)return;
  if(u.origin===location.origin&&u.pathname.includes('/v1.64/'))return;
  e.respondWith(caches.open(V).then(async c=>{
    const hit=await c.match(r,{ignoreSearch:u.origin===location.origin});
    const net=fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res}).catch(()=>hit);
    return hit||net;
  }));
});
