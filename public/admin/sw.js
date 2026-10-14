// Service worker do painel: permite instalar no telemóvel e abrir o painel mesmo com rede fraca.
// Os dados (/api/) NUNCA são guardados em cache — vêm sempre do servidor, para a agenda estar sempre certa.
const CACHE = 'painel-v2';
const SHELL = ['/admin/', '/admin/admin.css', '/admin/admin.js', '/admin/vendor/qrcode.js', '/assets/site.css', '/assets/img/logo-am.webp', '/assets/img/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // rede primeiro (versão mais recente); se falhar, usa a cópia guardada
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && (url.pathname.startsWith('/admin/') || url.pathname.startsWith('/assets/'))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('/admin/') : Response.error()))));
});
