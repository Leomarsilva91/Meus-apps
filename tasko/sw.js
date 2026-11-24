const C='tasko-v1795529355';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','manifest.webmanifest','icon-192.png'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x.startsWith('tasko-')).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
e.respondWith(fetch(new Request(e.request.url,{cache:'no-cache',credentials:'same-origin'})).then(r=>{const x=r.clone();caches.open(C).then(c=>c.put(e.request,x));return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match('./'))))});
self.addEventListener('notificationclick',e=>{const g=e.notification.data&&e.notification.data.go;e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(L=>{const c=L.find(x=>x.url.indexOf(self.registration.scope)===0);if(c){if(g)c.postMessage({go:g});return c.focus()}return self.clients.openWindow('./'+(g?'?go='+g:''))}))});
