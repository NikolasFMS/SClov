/**
 * Pure Vanilla Path-Scoped Offline Service Worker for "Удачные слова (So Clover!)"
 * Zero dependencies, zero build steps — built directly for GitHub Pages (Deploy from a branch).
 * Strictly isolated by registration scope and unique cache prefix so it NEVER
 * interferes with other apps hosted on the same *.github.io domain.
 */

const SCOPE_URL = self.registration.scope;
const SCOPE_SLUG =
  new URL(SCOPE_URL).pathname
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/^_+|_+$/g, "") || "root";

const CACHE_PREFIX = `udachnye-slova-so-clover-${SCOPE_SLUG}-`;
const CACHE_NAME = `${CACHE_PREFIX}v3`;

const STATIC_CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./pwa-192x192.png",
  "./pwa-512x512.png",
  "./pwa-maskable-512x512.png",
  "./css/style.css",
  "./js/main.js",
  "./js/audio.js",
  "./js/haptics.js",
  "./js/storage.js",
  "./js/state.js",
  "./js/i18n.js",
  "./js/decks.js",
  "./js/gameLogic.js",
  "./js/timer.js",
  "./js/dragDrop.js",
  "./js/cardsData.js",
  "./js/components/cardRenderer.js",
  "./js/components/boardRenderer.js",
  "./js/screens/setupScreen.js",
  "./js/screens/leaderScreens.js",
  "./js/screens/teamScreens.js",
  "./js/screens/summaryScreen.js",
  "./decks/manifest.json",
  "./decks/original.js",
  "./decks/partyWords.js",
  "./decks/cinemaDeck.js",
  "./js/dictionaries/index.js",
  "./js/dictionaries/00_Dictionary_Decripto_En.js",
  "./js/dictionaries/01_Dictionary_Codenames_GaGaGames_Ru.js",
  "./js/dictionaries/02_Dictionary_Codenames_En.js",
  "./js/dictionaries/03_Dictionary_Codenames_Duet_En.js",
  "./js/dictionaries/04_Dictionary_Codenames_Undercover_Ru.js",
  "./js/dictionaries/05_Dictionary_Codenames_Undercover_En.js",
  "./js/dictionaries/06_Dictionary_Pard_Ru.js",
  "./js/dictionaries/07_Dictionary_vpupkin_Ru.js",
  "./js/dictionaries/08_Dictionary_IvanZavorin_Ru.js",
  "./js/dictionaries/09_Dictionary_deNull_Ru.js",
  "./js/dictionaries/10_Dictionary_deNull_18_Ru.js",
  "./js/dictionaries/11_Dictionary_deNull_En.js",
  "./js/dictionaries/12_Dictionary_deNull_18_En.js",
  "./js/dictionaries/13_Dictionary_Esperanto.js",
  "./js/dictionaries/14_Dictionary_DoodleDash_Ru.js",
  "./js/dictionaries/15_Dictionary_JustOne.js",
  "./js/dictionaries/16_Dictionary_SoClover_En.js",
  "./js/dictionaries/17_Dictionary_LowInk_Ru.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const urlsToCache = new Set(
        STATIC_CORE_FILES.map((rel) => new URL(rel, SCOPE_URL).href)
      );

      // Dynamically precache any custom decks listed in decks/manifest.json
      try {
        const manifestUrl = new URL("./decks/manifest.json", SCOPE_URL).href;
        const manifestResp = await fetch(manifestUrl, { cache: "no-cache" });
        if (manifestResp.ok) {
          await cache.put(manifestUrl, manifestResp.clone());
          const list = await manifestResp.json();
          if (Array.isArray(list)) {
            for (const fileName of list) {
              if (typeof fileName === "string" && fileName.endsWith(".js")) {
                urlsToCache.add(new URL(`./decks/${encodeURIComponent(fileName)}`, SCOPE_URL).href);
              }
            }
          }
        }
      } catch (_) {}

      await Promise.allSettled(
        Array.from(urlsToCache).map(async (targetUrl) => {
          const resp = await fetch(new Request(targetUrl, { cache: "reload" }));
          if (resp && resp.ok) {
            await cache.put(targetUrl, resp);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // ONLY delete old caches belonging to THIS exact app & scope
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(
          data.urls
            .map((u) => new URL(u, SCOPE_URL).href)
            .filter((href) => href.startsWith(SCOPE_URL))
            .map(async (href) => {
              const resp = await fetch(new Request(href, { cache: "no-cache" }));
              if (resp && resp.ok) {
                await cache.put(href, resp);
              }
            })
        );
      })()
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Strictly NEVER intercept cross-origin requests or requests outside THIS app's scope
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(SCOPE_URL)) return;

  const isIconOrImage = /\.(png|svg|ico|webp|jpg|jpeg)$/i.test(url.pathname);

  if (isIconOrImage) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;

        try {
          const networkResp = await fetch(req);
          if (networkResp && networkResp.ok) {
            await cache.put(req, networkResp.clone());
          }
          return networkResp;
        } catch (_) {
          return new Response("", { status: 404 });
        }
      })()
    );
    return;
  }

  // Network-First with offline Cache Fallback for HTML, JS, CSS, JSON, and decks
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkResp = await fetch(req);
        if (networkResp && networkResp.ok) {
          if (url.searchParams.has("_reinstall")) {
            await cache.put(new URL("./index.html", SCOPE_URL).href, networkResp.clone());
          } else {
            await cache.put(req, networkResp.clone());
          }
        }
        return networkResp;
      } catch (_) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;

        if (req.mode === "navigate") {
          const fallbackIndex =
            (await cache.match(new URL("./index.html", SCOPE_URL).href)) ||
            (await cache.match(new URL("./", SCOPE_URL).href));
          if (fallbackIndex) return fallbackIndex;
        }

        return new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })()
  );
});
