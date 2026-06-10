/**
 * Scouted — /api/games
 * Fetches the published 2026 Google Sheet (CSV), shapes it into clean JSON
 * the site can render, and caches it. Mirrors the giveaways proxy pattern.
 *
 * The sheet is the source of truth: edit a row, and within the cache window
 * the site reflects it. No commit/rebuild needed for data changes.
 */

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJHp6pQ_DWusfHJS0yASz1Jfojf9AxiUdLKFl6L36D2PAdRll82N0GsCZVfqrzwcMlYzKI_tijAX-U/pub?gid=861065394&single=true&output=csv';

// Column positions in the published CSV (0 = first column).
const COL = {
  rawg: 1, steam: 2, date: 4, game: 5, platforms: 6, store: 7,
  ea: 8, port: 9, price: 10, steamRating: 11, critic: 12, hours: 13,
  gameScore: 14, ghostScore: 15, genres: 16, tags: 17, cover: 18
};

export async function onRequest() {
  try {
    const res = await fetch(CSV_URL, { cf: { cacheTtl: 1800, cacheEverything: true } });
    if (!res.ok) throw new Error('sheet fetch failed: ' + res.status);
    const text = await res.text();
    const games = shape(parseCSV(text));
    return json(games);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300'
    }
  });
}

// Minimal quote-aware CSV parser (handles commas inside quoted fields).
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function num(v) {
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function shape(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {   // skip header
    const r = rows[i];
    if (!r) continue;
    const name = (r[COL.game] || '').trim();
    if (!name) continue;

    const official = num(r[COL.gameScore]);  // Game Score (needs a critic score)
    const ghost = num(r[COL.ghostScore]);    // provisional fallback
    const score = official != null ? official : ghost;
    if (score == null) continue;             // nothing scorable yet -> skip

    const steam = (r[COL.steam] || '').trim();
    const url = /^\d+$/.test(steam) ? 'https://store.steampowered.com/app/' + steam + '/' : '';

    out.push({
      game: name,
      releaseDate: (r[COL.date] || '').trim(),
      platforms: (r[COL.platforms] || '').trim(),
      price: (r[COL.price] || '').trim(),
      score: Math.round(score),
      official: official != null,
      ea: /^yes$/i.test((r[COL.ea] || '').trim()),
      port: /^yes$/i.test((r[COL.port] || '').trim()),
      genres: (r[COL.genres] || '').trim(),
      cover: (r[COL.cover] || '').trim(),
      url
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
