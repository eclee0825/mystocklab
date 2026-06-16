const CACHE_NAME = 'mystocklab-v1'

// 설치 시 핵심 파일 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/', '/src/main.tsx', '/src/styles.css'])
        .catch(() => {}) // 개발 환경에서 일부 실패해도 무시
    )
  )
  self.skipWaiting()
})

// 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// 네트워크 우선, 실패 시 캐시 사용 (API는 항상 네트워크)
self.addEventListener('fetch', (event) => {
  // API 요청은 캐시하지 않음
  if (event.request.url.includes('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // 성공 응답은 캐시에 저장
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return res
      })
      .catch(() => caches.match(event.request))
  )
})
