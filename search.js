/* Scouted — search.
   Matching engine (used by the nav overlay AND the rankings filter box) plus a
   global overlay that searches the whole catalogue from /api/games.
   No server, no new endpoint: it filters the in-memory list every page already loads. */
(function () {
  "use strict";

  var STOP = { the:1, of:1, a:1, an:1, and:1, to:1, for:1, in:1, on:1, with:1 };

  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip accents
      .replace(/[^a-z0-9]+/g, " ").trim();                // punctuation -> space
  }
  function tokens(s) { var n = norm(s); return n ? n.split(" ") : []; }
  function sigWords(title) {
    var t = tokens(title).filter(function (w) { return !STOP[w]; });
    return t.length ? t : tokens(title);
  }
  function initials(words) { return words.map(function (w) { return w[0]; }).join(""); }

  // Each query char must start the next unused word (letters acronym): botw, rer.
  function acronymPrefix(words, q) {
    var wi = 0;
    for (var i = 0; i < q.length; i++) {
      var matched = false;
      while (wi < words.length) {
        if (words[wi][0] === q[i]) { wi++; matched = true; break; }
        wi++;
      }
      if (!matched) return false;
    }
    return true;
  }
  // Can q be split so each piece is a prefix of consecutive words? resevil, davediver.
  function prefixChain(words, q) {
    function go(wi, qi) {
      if (qi === q.length) return true;
      if (wi >= words.length) return false;
      var w = words[wi], max = Math.min(w.length, q.length - qi);
      for (var k = max; k >= 1; k--) {
        if (w.indexOf(q.slice(qi, qi + k)) === 0 && go(wi + 1, qi + k)) return true;
      }
      return go(wi + 1, qi);   // allow skipping a word (stop-words)
    }
    return go(0, 0);
  }

  // 0 = no match; higher = better.
  function score(title, q) {
    var nt = norm(title), nq = norm(q);
    if (!nq) return 0;
    var tw = tokens(title), qw = tokens(q);
    var words = sigWords(title);
    var sigAll = tw.join("");
    var nqSquish = nq.replace(/ /g, "");

    if (nt === nq) return 1000;
    if (nt.indexOf(nq) === 0) return 800;

    var everyWordPrefixes = qw.every(function (qt) {
      return tw.some(function (t) { return t.indexOf(qt) === 0; });
    });
    if (everyWordPrefixes && nt.indexOf(nq) !== -1) return 700;
    if (tw[0] && qw[0] && tw[0].indexOf(qw[0]) === 0 && everyWordPrefixes) return 620;
    if (everyWordPrefixes) return 520;

    if (nqSquish.length >= 3) {
      if (sigAll.indexOf(nqSquish) === 0) return 560;
      if (sigAll.indexOf(nqSquish) !== -1) return 360;
      if (prefixChain(tw, nqSquish)) return 340;
    }
    if (nt.indexOf(nq) !== -1) return 400;

    if (qw.length === 1 && qw[0].length >= 2) {
      var iniSig = initials(words), iniAll = initials(tw);
      if (iniSig === qw[0] || iniAll === qw[0]) return 560;
      if (iniSig.indexOf(qw[0]) === 0 || iniAll.indexOf(qw[0]) === 0) return 470;
      if (acronymPrefix(tw, qw[0])) return 440;
    }

    var hit = qw.filter(function (qt) {
      return tw.some(function (t) { return t.indexOf(qt) === 0; });
    }).length;
    if (hit) return 150 + hit * 30;
    return 0;
  }

  // list: array of game objects with a .game title. Returns sorted matches.
  function run(list, q, limit) {
    if (!q || !norm(q)) return [];
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var s = score(list[i].game, q);
      if (s > 0) scored.push({ g: list[i], s: s });
    }
    scored.sort(function (a, b) {
      return b.s - a.s ||
             a.g.game.length - b.g.game.length ||
             a.g.game.localeCompare(b.g.game);
    });
    if (limit) scored = scored.slice(0, limit);
    return scored.map(function (x) { return x.g; });
  }

  var Search = { score: score, run: run, norm: norm };

  /* ---------------- global nav overlay ---------------- */

  var CATALOG = null, loading = null;

  function loadCatalog() {
    if (CATALOG) return Promise.resolve(CATALOG);
    if (loading) return loading;
    loading = fetch("/api/games", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) { CATALOG = Array.isArray(d) ? d : []; return CATALOG; })
      .catch(function () { CATALOG = []; return CATALOG; });
    return loading;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m];
    });
  }

  var overlay, input, results, activeIdx = -1, current = [];

  function buildOverlay() {
    overlay = document.createElement("div");
    overlay.className = "search-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Search games");
    overlay.innerHTML =
      '<div class="search-panel">' +
        '<div class="search-box">' +
          '<svg class="search-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
          '<input type="text" class="search-input" placeholder="Search games\u2026" autocomplete="off" spellcheck="false" aria-label="Search games">' +
          '<button class="search-close" aria-label="Close">Esc</button>' +
        '</div>' +
        '<div class="search-results" role="listbox"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector(".search-input");
    results = overlay.querySelector(".search-results");

    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector(".search-close").addEventListener("click", close);
    input.addEventListener("input", onType);
    input.addEventListener("keydown", onKey);
    results.addEventListener("click", function (e) {
      var row = e.target.closest ? e.target.closest(".search-row") : null;
      if (row && row.getAttribute("data-nolink")) e.preventDefault();  // nothing to open yet
    });
  }

  function storeUrl(g) {
    // Today results link to the Steam store. When game landing pages exist,
    // change ONLY this function to return "/game/<slug>".
    return g.url || (g.steam ? "https://store.steampowered.com/app/" + g.steam + "/" : "");
  }

  function tierClass(s) {
    return s >= 90 ? "diamond" : s >= 80 ? "blue" : s >= 70 ? "yellow" : s >= 60 ? "orange" : "red";
  }

  function rowHtml(g, i) {
    var meta = [];
    if (g.year) meta.push(g.year);
    var plats = String(g.platforms || "").split(/[,|]/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (plats.length) meta.push(plats.slice(0, 3).join(" \u00b7 "));
    var chip = g.official ? '<span class="s-score ' + tierClass(g.score) + '">' + g.score + "</span>"
             : (g.score != null ? '<span class="s-score tbd">TBD</span>' : "");
    var url = storeUrl(g);
    // A row with no destination still opens on click (via onRowClick); href="#"
    // would jump to the top of the page, and href="" would reload it.
    return '<a class="search-row" role="option" data-i="' + i + '"' +
           (url ? ' href="' + esc(url) + '" target="_blank" rel="noopener"' : ' data-nolink="1"') + '>' +
             '<span class="s-name">' + esc(g.game) + "</span>" +
             '<span class="s-meta">' + esc(meta.join("  \u00b7  ")) + "</span>" +
             chip +
           "</a>";
  }

  function onType() {
    var q = input.value;
    loadCatalog().then(function (list) {
      current = run(list, q, 8);
      activeIdx = -1;
      if (!norm(q)) { results.innerHTML = ""; results.classList.remove("has"); return; }
      if (!current.length) {
        results.innerHTML = '<div class="search-empty">No games match \u201c' + esc(q.trim()) + '\u201d.</div>';
        results.classList.add("has");
        return;
      }
      results.innerHTML = current.map(rowHtml).join("");
      results.classList.add("has");
    });
  }

  function setActive(i) {
    var rows = results.querySelectorAll(".search-row");
    if (!rows.length) return;
    activeIdx = (i + rows.length) % rows.length;
    for (var r = 0; r < rows.length; r++) rows[r].classList.toggle("active", r === activeIdx);
    rows[activeIdx].scrollIntoView({ block: "nearest" });
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
    else if (e.key === "Enter") {
      var rows = results.querySelectorAll(".search-row");
      var pick = activeIdx >= 0 ? rows[activeIdx] : rows[0];
      if (pick) pick.click();
    } else if (e.key === "Escape") { close(); }
  }

  function open() {
    if (!overlay) buildOverlay();
    loadCatalog();
    overlay.classList.add("show");
    document.body.style.overflow = "hidden";
    input.value = "";
    results.innerHTML = "";
    results.classList.remove("has");
    setTimeout(function () { input.focus(); }, 30);
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  // Any [data-search-open] element opens it; "/" or Cmd/Ctrl-K opens it too.
  document.addEventListener("click", function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.hasAttribute && t.hasAttribute("data-search-open")) { e.preventDefault(); open(); return; }
      t = t.parentNode;
    }
  });
  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "")) ||
                 e.target.isContentEditable;
    if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault(); open();
    }
  });

  Search.open = open;
  Search.close = close;
  window.ScoutedSearch = Search;
})();
