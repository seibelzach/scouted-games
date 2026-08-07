// Cloudflare Pages Function
// Lives at the URL path: /api/giveaways
//
// Why this exists: the browser can't call the GamerPower API directly
// (cross-origin requests get blocked). So this small helper runs on
// Cloudflare's servers, fetches the data, and hands it back to your page
// from the same domain. You don't need to touch this file.

export async function onRequest(context) {
  // Prefer game giveaways, but fall back to the full feed (loot, beta, other)
  // when there are no active game giveaways, so the list rarely runs dry.
  const GAMES = "https://www.gamerpower.com/api/giveaways?type=game";
  const ALL   = "https://www.gamerpower.com/api/giveaways";
  const opts = {
    headers: { "User-Agent": "ScoutedGames/1.0 (+https://scoutedgames.com)" },
    cf: { cacheTtl: 600, cacheEverything: true },
  };

  async function grab(url) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error("Upstream " + res.status);
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];   // status-object -> empty
  }

  try {
    let list = await grab(GAMES);
    if (!list.length) list = await grab(ALL);   // game feed dry -> widen

    return new Response(JSON.stringify(list), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=600",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=60",
      },
    });
  }
}
