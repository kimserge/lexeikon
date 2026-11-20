const V='lexeikon-v155';
const PRE=['./','index.html','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png',
 'data/syr.json','data/brk.json','data/cos.json','data/ka.json','data/kac.json','data/agwb.json','data/dil.json','data/gez.json','data/rai.json','data/la.json','data/hy.json','data/mis.json','data/cop.json','data/che.json','data/graf.json','data/are.json','data/deu-fra.json','data/deu-rus.json','data/chlex.json','data/deu-eng.json','data/deu-ita.json','data/lade.json','data/kun.json','data/psm.json','data/latforms.json','data/grc.json','data/ml.json','data/laen.json','data/lafr.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(PRE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('lexeikon-v')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url),font=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if(u.origin!==location.origin&&!font)return;
  if(u.origin===location.origin&&u.pathname.includes('/v1.64/'))return;
  if(u.origin===location.origin&&(u.pathname.includes('/data/u/')||/\/(v2|v3|t4-a985fa)\//.test(u.pathname)))return;
  // pages (index, proj, admin): network first, so a new release is seen at once; cache only offline
  if(r.mode==='navigate'||/\.html$/.test(u.pathname)){e.respondWith(caches.open(V).then(async c=>{try{const res=await fetch(r,{cache:'no-cache'});if(res&&res.ok)c.put(r,res.clone());return res}catch(err){return (await c.match(r,{ignoreSearch:true}))||(await c.match('./'))||Response.error()}}));return}
  e.respondWith(caches.open(V).then(async c=>{
    const hit=(await c.match(r,{ignoreSearch:u.origin===location.origin}))||(await caches.match(r,{ignoreSearch:u.origin===location.origin}));
    const net=fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res}).catch(()=>hit);
    return hit||net;
  }));
});
