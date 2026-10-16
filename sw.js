'use strict';

// Cache only application files. Notes remain in localStorage.
const CACHE_PREFIX = 'smartnotes-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const SCOPE_URL = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // These URLs must both serve the application over the same HTTPS origin.
        await cache.addAll([
            new Request(SCOPE_URL, { cache: 'reload' }),
            new Request(INDEX_URL, { cache: 'reload' })
        ]);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    if (new URL(request.url).origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        const cachePromise = caches.open(CACHE_NAME);
        const network = (async () => {
            try {
                const response = await fetch(request);
                if (response.ok && response.type === 'basic') {
                    try {
                        const cache = await cachePromise;
                        await cache.put(INDEX_URL, response.clone());
                    } catch (error) {
                        // A caching failure must not prevent online loading.
                        console.warn('App-shell refresh failed:', error);
                    }
                }
                return response;
            } catch (error) {
                return null;
            }
        })();

        // Keep the background refresh alive even when returning cached HTML.
        event.waitUntil(network.then(() => undefined));
        event.respondWith((async () => {
            const cache = await cachePromise;
            const cached = await cache.match(INDEX_URL) || await cache.match(SCOPE_URL);
            if (cached) return cached; // Immediate offline-first startup.
            return await network || new Response('SmartNotes is offline and has not been cached yet.', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        })());
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
            return await fetch(request);
        } catch (error) {
            return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
    })());
});