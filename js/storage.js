/**
 * Isolated Storage Namespace Helper
 * Generates keys strictly scoped to THIS application and its deployment path
 * (e.g., https://user.github.io/udachnye-slova/), ensuring ZERO collisions with
 * other apps hosted on the same GitHub Pages origin.
 */

export function getAppStoragePrefix() {
  try {
    if (typeof window !== "undefined" && window.location) {
      const scopePath = new URL("./", window.location.href).pathname;
      return `udachnye_slova_so_clover::${scopePath}::`;
    }
  } catch (_) {}
  return "udachnye_slova_so_clover::default::";
}

export function requestPersistentStorage() {
  try {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persist().catch(() => {});
    }
  } catch (_) {}
}
