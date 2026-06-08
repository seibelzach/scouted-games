// Cloudflare Pages Function
// Lives at the URL path: /api/giveaways
//
// Why this exists: the browser can't call the GamerPower API directly
// (cross-origin requests get blocked). So this small helper runs on
// Cloudflare's servers, fetches the data, and hands it back to your page
// from the same domain. You don't need to touch this file.

export async function onRequest(context) {
  const UPSTREAM = "https://www.gamerpower.com/api/giveaways?type=game";

  try {
    const res = await fetch(UPSTREAM, {
      headers: { "User-Agent": "ScoutedGames/1.0 (+https://scoutedgames.com)" },
      // Cache GamerPower's response on Cloudflare for 10 minutes so we stay
      // well under their rate limit and the page loads fast.
      cf: { cacheTtl: 600, cacheEverything: true },
    });

    if (!res.ok) {
      throw new Error("Upstream responded " + res.status);
    }

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=600",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Could not load giveaways right now." }),
      {
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
        },
      }
    );
  }
}
