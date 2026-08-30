/* Footix Prono V9.9.4 — lecture live anti-cache.
   Pour live-results.json, on lit d'abord la branche main brute GitHub.
   Si GitHub Raw est indisponible, on retombe automatiquement sur le fichier local. */
(() => {
  const nativeFetch = window.fetch.bind(window);
  const RAW_LIVE = "https://raw.githubusercontent.com/etezx/footixprono/main/live-results.json";

  window.fetch = async (input, init = {}) => {
    const requested = typeof input === "string" ? input : (input && input.url) || "";

    if (!/live-results\.json(?:[?#]|$)/i.test(requested)) {
      return nativeFetch(input, init);
    }

    const options = {...init, cache: "no-store"};
    const stamp = Date.now();

    try {
      const raw = await nativeFetch(`${RAW_LIVE}?t=${stamp}`, options);
      if (raw.ok) return raw;
    } catch (err) {
      console.warn("Footix Live: GitHub Raw indisponible, fallback local.", err);
    }

    const local = `live-results.json?t=${stamp}`;
    return nativeFetch(local, options);
  };
})();
