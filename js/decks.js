/**
 * Deck Registry, Normalizer & Auto-Discovery
 * Pure standard ECMAScript modules (100% compatible with native GitHub Pages
 * static hosting, offline PWA mode, and Vite builds).
 *
 * Automatically discovers any additional .js deck files placed into decks/ via:
 *  1) GitHub Contents API (when hosted on *.github.io)
 *  2) ./decks/manifest.json (auto-maintained in Vite dev/build)
 *  3) Local HTTP directory listing (for python -m http.server / nginx / etc.)
 *  4) Isolated localStorage offline cache of previously discovered decks
 */
import originalDeck from "../decks/original.js";
import partyWordsDeck from "../decks/partyWords.js";
import cinemaDeck from "../decks/cinemaDeck.js";
import { EXTRA_DICTIONARY_DECKS } from "./dictionaries/index.js";
import { getAppStoragePrefix } from "./storage.js";

const BUILTIN_FILES = new Set(["original.js", "partyWords.js", "cinemaDeck.js"]);

const BUILTIN_DECKS = [originalDeck, cinemaDeck, partyWordsDeck, ...EXTRA_DICTIONARY_DECKS];
const BUILTIN_ORDER = new Map(BUILTIN_DECKS.map((d, i) => [d.id, i]));

const EXTRA_DECKS_CACHE_KEY = `${getAppStoragePrefix()}extra_decks_v1`;
const GITHUB_ETAG_KEY = `${getAppStoragePrefix()}decks_gh_etag_v1`;

/**
 * Normalizes a raw deck object into a standardized format.
 */
export function normalizeDeck(raw, fallbackId = "custom", fileName = null) {
  if (!raw || typeof raw !== "object") return null;

  const hasCards = Array.isArray(raw.cards) && raw.cards.length >= 5;
  const hasWords = Array.isArray(raw.words) && raw.words.length > 0;
  if (!hasCards && !hasWords) return null;

  const id = raw.id || fallbackId;
  let wordPairs = [];

  if (hasCards) {
    wordPairs = raw.cards
      .flatMap((card) => {
        const ruWords = Array.isArray(card.ru)
          ? card.ru
          : Array.isArray(card.words)
            ? card.words
            : [];
        const enWords = Array.isArray(card.en) ? card.en : ruWords;
        return ruWords.map((ru, idx) => ({
          ru: String(ru).trim(),
          en: String(enWords[idx] || ru).trim()
        }));
      })
      .filter((p) => p.ru.length > 0);
  } else if (hasWords) {
    wordPairs = raw.words
      .map((item) => {
        if (typeof item === "string") {
          return { ru: item.trim(), en: item.trim() };
        }
        if (item && typeof item === "object") {
          return {
            ru: String(item.ru || item.word || "").trim(),
            en: String(item.en || item.ru || item.word || "").trim()
          };
        }
        return { ru: "", en: "" };
      })
      .filter((p) => p.ru.length > 0);
  }

  if (wordPairs.length === 0) return null;

  return {
    id,
    fileName,
    raw,
    name: raw.name || id,
    description: raw.description || "",
    hasPredefinedCards: hasCards,
    cards: hasCards ? raw.cards : [],
    wordPairs,
    cardsCount: hasCards ? raw.cards.length : Math.floor(wordPairs.length / 4),
    wordsCount: wordPairs.length
  };
}

function sortDecks(list) {
  list.sort((a, b) => {
    const ordA = BUILTIN_ORDER.has(a.id) ? BUILTIN_ORDER.get(a.id) : Number.MAX_SAFE_INTEGER;
    const ordB = BUILTIN_ORDER.has(b.id) ? BUILTIN_ORDER.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ordA !== ordB) return ordA - ordB;
    const nameA = typeof a.name === "object" ? a.name.ru || a.id : String(a.name || a.id);
    const nameB = typeof b.name === "object" ? b.name.ru || b.id : String(b.name || b.id);
    return nameA.localeCompare(nameB);
  });
}

function loadCachedExtraDecks() {
  try {
    const raw = localStorage.getItem(EXTRA_DECKS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeDeck(entry.raw || entry, entry.id, entry.fileName || null))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function saveCachedExtraDecks(extraDecks) {
  try {
    const serializable = extraDecks.map((d) => ({
      id: d.id,
      fileName: d.fileName || null,
      raw: d.raw
    }));
    localStorage.setItem(EXTRA_DECKS_CACHE_KEY, JSON.stringify(serializable));
  } catch (_) {}
}

function buildInitialDecks() {
  const map = new Map();
  BUILTIN_DECKS.forEach((raw, idx) => {
    const norm = normalizeDeck(raw, `deck-${idx + 1}`, null);
    if (norm) map.set(norm.id, norm);
  });

  // Merge offline-cached extra decks so they appear instantly even offline
  for (const extra of loadCachedExtraDecks()) {
    if (!map.has(extra.id)) {
      map.set(extra.id, extra);
    }
  }

  const list = Array.from(map.values());
  sortDecks(list);
  return list;
}

export const AVAILABLE_DECKS = buildInitialDecks();

/**
 * Helper to get currently selected deck objects based on state.selectedDeckIds.
 */
export function getSelectedDecks(state) {
  const ids = Array.isArray(state?.selectedDeckIds)
    ? state.selectedDeckIds
    : [state?.selectedDeckId || "original"];
  const list = AVAILABLE_DECKS.filter((d) => ids.includes(d.id));
  return list.length > 0 ? list : [AVAILABLE_DECKS[0]];
}

/**
 * Queries GitHub REST API when hosted on *.github.io to discover any new .js
 * files added directly into decks/ without needing a build step.
 */
async function fetchGitHubDecksList() {
  try {
    if (typeof window === "undefined") return null;
    const hostMatch = window.location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!hostMatch) return null;

    const owner = hostMatch[1];
    const segments = window.location.pathname.split("/").filter(Boolean);
    const cleaned = segments.filter((s) => s.toLowerCase() !== "index.html");

    let repo = cleaned[0];
    let subPath = cleaned.slice(1).join("/");
    if (!repo) {
      repo = `${owner}.github.io`;
      subPath = "";
    }

    const decksPath = subPath ? `${subPath}/decks` : "decks";
    const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${decksPath}`;

    const headers = { Accept: "application/vnd.github.v3+json" };
    const savedEtag = localStorage.getItem(GITHUB_ETAG_KEY);
    if (savedEtag) {
      headers["If-None-Match"] = savedEtag;
    }

    let resp = await fetch(apiBase, { headers });
    if (resp.status === 304) {
      return { unchanged: true, files: null };
    }
    if (resp.status === 404) {
      // Fallback if repo publishes from gh-pages branch
      resp = await fetch(`${apiBase}?ref=gh-pages`, {
        headers: { Accept: "application/vnd.github.v3+json" }
      });
    }
    if (!resp.ok) return null;

    const newEtag = resp.headers.get("ETag");
    if (newEtag) {
      try {
        localStorage.setItem(GITHUB_ETAG_KEY, newEtag);
      } catch (_) {}
    }

    const items = await resp.json();
    if (!Array.isArray(items)) return null;

    const files = items
      .filter((item) => item && item.type === "file" && typeof item.name === "string" && item.name.endsWith(".js"))
      .map((item) => item.name);

    return { unchanged: false, files };
  } catch (_) {
    return null;
  }
}

async function fetchManifestDecksList() {
  try {
    const manifestUrl = new URL("./decks/manifest.json", window.location.href).href;
    const resp = await fetch(manifestUrl, { cache: "no-cache" });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!Array.isArray(data)) return null;
    return data.filter((name) => typeof name === "string" && name.endsWith(".js"));
  } catch (_) {
    return null;
  }
}

async function fetchDirectoryListingDecks() {
  try {
    if (window.location.hostname.endsWith(".github.io")) return null;
    const dirUrl = new URL("./decks/", window.location.href).href;
    const resp = await fetch(dirUrl, { cache: "no-cache" });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    const html = await resp.text();
    const matches = [...html.matchAll(/href=["']([^"']+\.js)["']/gi)];
    const files = matches
      .map((m) => m[1].split("/").pop().split("?")[0])
      .filter((name) => name && name.endsWith(".js"));
    return Array.from(new Set(files));
  } catch (_) {
    return null;
  }
}

function extractRawDeckFromModule(mod) {
  if (!mod || typeof mod !== "object") return null;
  if (mod.default && typeof mod.default === "object") {
    return mod.default;
  }
  for (const val of Object.values(mod)) {
    if (val && typeof val === "object" && (Array.isArray(val.cards) || Array.isArray(val.words))) {
      return val;
    }
  }
  return null;
}

function askServiceWorkerToCache(urls) {
  try {
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      navigator.serviceWorker.controller &&
      urls.length > 0
    ) {
      navigator.serviceWorker.controller.postMessage({
        type: "CACHE_URLS",
        urls
      });
    }
  } catch (_) {}
}

/**
 * Discovers any extra .js deck files in decks/ at runtime, imports them dynamically,
 * caches them for offline use, and notifies the UI when AVAILABLE_DECKS updates.
 */
export async function discoverExtraDecks(onUpdated) {
  if (typeof window === "undefined") return AVAILABLE_DECKS;

  const [manifestFiles, githubResult, dirFiles] = await Promise.all([
    fetchManifestDecksList(),
    fetchGitHubDecksList(),
    fetchDirectoryListingDecks()
  ]);

  const candidateFiles = new Set();
  let authoritativeList = false;

  if (Array.isArray(manifestFiles)) {
    manifestFiles.forEach((f) => candidateFiles.add(f));
  }
  if (githubResult && !githubResult.unchanged && Array.isArray(githubResult.files)) {
    authoritativeList = true;
    githubResult.files.forEach((f) => candidateFiles.add(f));
  } else if (githubResult && githubResult.unchanged) {
    // GitHub API returned 304 Not Modified: keep cached extra decks intact
    for (const d of AVAILABLE_DECKS) {
      if (d.fileName) candidateFiles.add(d.fileName);
    }
  }
  if (Array.isArray(dirFiles)) {
    authoritativeList = true;
    dirFiles.forEach((f) => candidateFiles.add(f));
  }

  const extraFileNames = Array.from(candidateFiles).filter((f) => !BUILTIN_FILES.has(f));
  if (extraFileNames.length === 0 && !authoritativeList) {
    return AVAILABLE_DECKS;
  }

  const loadedExtras = [];
  const urlsToCache = [];

  for (const fileName of extraFileNames) {
    try {
      const moduleUrl = new URL(`./decks/${encodeURIComponent(fileName)}`, window.location.href).href;
      urlsToCache.push(moduleUrl);
      const mod = await import(/* @vite-ignore */ moduleUrl);
      const raw = extractRawDeckFromModule(mod);
      const fallbackId = fileName.replace(/\.js$/i, "");
      const normalized = normalizeDeck(raw, fallbackId, fileName);
      if (normalized) {
        loadedExtras.push(normalized);
      }
    } catch (_) {}
  }

  // Build updated deck list
  const builtinIds = new Set();
  const nextMap = new Map();

  BUILTIN_DECKS.forEach((raw, idx) => {
    const norm = normalizeDeck(raw, `deck-${idx + 1}`, null);
    if (norm) {
      builtinIds.add(norm.id);
      nextMap.set(norm.id, norm);
    }
  });

  // If offline or non-authoritative, retain previously cached extras not explicitly removed
  if (!authoritativeList) {
    for (const prev of AVAILABLE_DECKS) {
      if (!builtinIds.has(prev.id)) {
        nextMap.set(prev.id, prev);
      }
    }
  }

  for (const extra of loadedExtras) {
    nextMap.set(extra.id, extra);
  }

  const nextList = Array.from(nextMap.values());
  sortDecks(nextList);

  const prevSignature = AVAILABLE_DECKS.map((d) => `${d.id}:${d.wordsCount}`).join("|");
  const nextSignature = nextList.map((d) => `${d.id}:${d.wordsCount}`).join("|");

  AVAILABLE_DECKS.length = 0;
  AVAILABLE_DECKS.push(...nextList);

  // Persist extra decks offline in isolated localStorage
  const extrasToSave = nextList.filter((d) => !builtinIds.has(d.id));
  saveCachedExtraDecks(extrasToSave);

  if (urlsToCache.length > 0) {
    askServiceWorkerToCache(urlsToCache);
  }

  if (prevSignature !== nextSignature && typeof onUpdated === "function") {
    onUpdated(AVAILABLE_DECKS);
  }

  return AVAILABLE_DECKS;
}
