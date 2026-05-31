const CACHE='verm-v67';
const ASSETS=[
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&display=swap'
];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  const url=e.request.url;
  // Network-first for live price API calls
  if(url.includes('api.')||url.includes('query1.')||url.includes('query2.')||url.includes('stooq.')||url.includes('workers.dev')||url.includes('frankfurter')){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
  }
  // Cache-first for fonts (Google Fonts serves different CSS per user-agent)
  else if(url.includes('fonts.gstatic.com')){
    e.respondWith(caches.match(e.request).then(r=>{
      if(r)return r;
      return fetch(e.request).then(resp=>{
        const clone=resp.clone();
        caches.open(CACHE).then(c=>c.put(e.request,clone));
        return resp;
      });
    }));
  }
  // Stale-while-revalidate for index.html: serve cached copy instantly (no blank
  // screen while waiting for the network), then update the cache in the background
  // so the next launch gets the latest version.
  else if(url.endsWith('index.html')||url.endsWith('/')){
    e.respondWith(caches.match(e.request).then(cached=>{
      const network=fetch(e.request).then(resp=>{
        const clone=resp.clone();
        caches.open(CACHE).then(c=>c.put(e.request,clone));
        return resp;
      }).catch(()=>cached);
      return cached||network;
    }));
  }
  // Cache-first for static assets (JS libs, manifest)
  else {
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
  }
});
