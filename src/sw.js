// 서비스워커 — 앱처럼 빠르게, 끊겨도 보이게.
// 원칙: HTML 은 네트워크 먼저(가격·재고가 낡지 않게), 정적 자원은 캐시 먼저.
// 개인정보·결제 화면은 캐시하지 않는다(체크아웃 제외).
const BASE = new URL(self.registration.scope).pathname;
const CACHE = 'dk-__VERSION__';
const PRECACHE = [BASE, BASE + 'offline/', BASE + 'assets/css/main.css', BASE + 'assets/css/tokens.css', BASE + 'assets/js/app.js', BASE + 'assets/fonts/onest-ru.woff2', BASE + 'data.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('dk-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/checkout/')) return;

  if (req.mode === 'navigate' || url.pathname.endsWith('data.json')) {
    e.respondWith(
      fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(r => r || caches.match(BASE + 'offline/')))
    );
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
