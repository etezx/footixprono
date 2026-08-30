/* Footix Prono V9.9.6 — rafraîchissement live toutes les 60 secondes.
   Pendant qu'un match L1/LDC est live, on contrôle GitHub Raw chaque minute.
   Si les données ont changé, la page se recharge pour afficher le nouvel état. */
(() => {
  const RAW = "https://raw.githubusercontent.com/etezx/footixprono/main/live-results.json";
  const INTERVAL = 60 * 1000;
  let lastSignature = null;

  function relevantLive(data) {
    return (data?.events || []).some(e =>
      [6,7].includes(Number(e.leagueId)) &&
      e.live === true &&
      e.completed !== true
    );
  }

  function signature(data) {
    return JSON.stringify((data?.events || [])
      .filter(e => [6,7].includes(Number(e.leagueId)))
      .map(e => [
        e.eventId, e.status, e.live, e.completed,
        e.currentMinute ?? e.minute ?? null,
        e.homeScore, e.awayScore
      ]));
  }

  async function fetchLive() {
    const r = await fetch(`${RAW}?t=${Date.now()}`, {cache:"no-store"});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function tick() {
    if (document.hidden) return;
    try {
      const data = await fetchLive();
      const sig = signature(data);

      if (lastSignature !== null && sig !== lastSignature) {
        location.reload();
        return;
      }
      lastSignature = sig;

      // Hors live, on garde un contrôle léger : le timer reste en place,
      // ce qui permet aussi de récupérer rapidement le passage LIVE -> FINI.
      document.documentElement.dataset.footixLive =
        relevantLive(data) ? "1" : "0";
    } catch (e) {
      console.warn("Footix Live 60s:", e);
    }
  }

  tick();
  setInterval(tick, INTERVAL);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
})();
