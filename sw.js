const V='lexeikon-v353',D='lexeikon-data';
const LAST=new Map(),RV=30*60*1000;
const PRE=['./','index.html','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(PRE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('lexeikon-v353')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url),font=/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if(u.origin!==location.origin&&!font)return;
  if(u.origin===location.origin&&u.pathname.includes('/v1.64/'))return;
  if(u.origin===location.origin&&(u.pathname.includes('/data/u/')||u.pathname.endsWith('/data/builtins.json')||/\/(v2|v3|v4|t4-a985fa)\//.test(u.pathname)))return;
  // pages: network first; on network error or a server refusal (429, 5xx) show the cached copy
  if(r.mode==='navigate'||/\.html$/.test(u.pathname)){e.respondWith(caches.open(V).then(async c=>{const old=async()=>(await c.match(r,{ignoreSearch:true}))||(await caches.match(r,{ignoreSearch:true}))||(await c.match('./'));try{const res=await fetch(r,{cache:'no-cache'});if(res&&res.ok){c.put(r,res.clone());return res}return (await old())||res}catch(err){return (await old())||Response.error()}}));return}
  // data, fonts, icons: kept across releases (no mass re-download); refreshed in the background
  e.respondWith(caches.open(D).then(async c=>{
    const io=u.origin===location.origin;
    if(r.cache==='reload'||r.cache==='no-store'){try{const res=await fetch(r);if(res&&res.ok)c.put(r,res.clone());return res}catch(err){const h=await c.match(r,{ignoreSearch:io});if(h)return h;throw err}}
    const hit=(await c.match(r,{ignoreSearch:io}))||(await caches.match(r,{ignoreSearch:io}));
    const key=u.pathname,now=Date.now();if(hit&&now-(LAST.get(key)||0)<RV)return hit;LAST.set(key,now);
    const net=fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(r,res.clone());return res.ok||res.type==='opaque'||!hit?res:hit}).catch(()=>hit);
    if(hit){e.waitUntil(net.catch(()=>{}));return hit}
    return net;
  }));
});
