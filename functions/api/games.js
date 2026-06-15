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

// This feed is the 2026 tab. When more year tabs are wired in, each gets
// its own fetch + YEAR tag so the site can filter across years.
const YEAR = 2026;

// Parse month + day from the sheet's own Release Date (e.g. "Jan-5" -> 1, 5).
// We use the date you typed, never RAWG's release date.
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
                 jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
function monthOf(dateStr) {
  const key = String(dateStr || '').trim().slice(0, 3).toLowerCase();
  return MONTHS[key] || null;
}
function dayOf(dateStr) {
  const m = String(dateStr || '').trim().match(/-\s*(\d{1,2})\b/);
  return m ? Number(m[1]) : null;
}

// Storefront column ("S or E?"): Steam / Epic / Both / N/A -> a list of names.
function storesOf(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'both') return ['Steam', 'Epic'];
  if (s === 'steam') return ['Steam'];
  if (s === 'epic') return ['Epic'];
  return [];   // N/A, blank, or anything else -> show nothing
}

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
    const score = official != null ? official : ghost;  // may be null for upcoming titles

    const steam = (r[COL.steam] || '').trim();
    const hasSteam = /^\d+$/.test(steam);
    const url = hasSteam ? 'https://store.steampowered.com/app/' + steam + '/' : '';

    out.push({
      game: name,
      releaseDate: (r[COL.date] || '').trim(),
      month: monthOf(r[COL.date]),
      day: dayOf(r[COL.date]),
      year: YEAR,
      platforms: (r[COL.platforms] || '').trim(),
      price: (r[COL.price] || '').trim(),
      score: score == null ? null : Math.round(score),
      official: official != null,
      ea: /^yes$/i.test((r[COL.ea] || '').trim()),
      port: /^yes$/i.test((r[COL.port] || '').trim()),
      genres: (r[COL.genres] || '').trim(),
      cover: (r[COL.cover] || '').trim(),
      steam: hasSteam ? steam : '',
      stores: storesOf(r[COL.store]),
      url
    });
  }
  // Scored first (official, then provisional by score), unscored/upcoming last.
  out.sort((a, b) => {
    if (a.official !== b.official) return a.official ? -1 : 1;
    return (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score);
  });
  return out;
}
