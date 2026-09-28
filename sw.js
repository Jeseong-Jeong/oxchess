// 오프라인 지원: 앱 파일은 네트워크 우선(새 버전 바로 반영), 안 되면 캐시.
// GitHub Pages는 max-age=600을 주므로 브라우저 HTTP 캐시를 거치지 않고 매번 서버에 확인(ETag라 변경 없으면 304로 가벼움).
// 앱 파일을 바꿔 배포할 때는 이 이름과 index.html의 ?v= 숫자를 같이 올린다.
const CACHE = 'oxchess-v7';
const SHELL = ['./', 'index.html', 'style.css', 'engine.js', 'net.js', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // 버전 고정된 라이브러리는 캐시 우선
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
  }
});
