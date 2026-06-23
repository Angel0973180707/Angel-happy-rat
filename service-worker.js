/* 笑鼠人了！ service worker
   目標：離線可開首頁與所有模式（純前端生成，不需要網路）。
   策略：app shell cache-first，其餘走 network-first 並回退快取。
*/
var CACHE_NAME = 'Angel-happy-rat-shell-v1';
var SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/rat-avatar.png',
  './icons/tiger-avatar.png',
  './icons/rat-poster.jpg',
  './icons/tiger-poster.jpg'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return; // 不快取 POST（分析事件 / GAS 儲存）

  // 影片檔案（主題曲 MV）完全不經過 Service Worker：
  // 1) 避免 Range request 被快取機制破壞播放（拖拉進度條會壞掉）
  // 2) 避免 30MB+ 檔案塞爆離線快取，違反「離線只開首頁」的初衷
  if(req.destination === 'video' || /\.mp4($|\?)/i.test(req.url)){
    return; // 交給瀏覽器原生網路請求 + HTTP cache 處理
  }

  event.respondWith(
    caches.match(req).then(function(cached){
      var network = fetch(req).then(function(res){
        if(res && res.status === 200 && req.url.indexOf(self.location.origin) === 0){
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
